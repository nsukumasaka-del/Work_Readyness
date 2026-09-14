import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authChallengesTable, db } from "@workspace/db";
import { sha256Hex } from "./auth-crypto";
import { sendAuthCodeEmail } from "./email";
import { logger } from "./logger";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type ChallengePurpose = "signup" | "email_change" | "magic_link" | "mfa_login" | "mfa_setup";

function hashCode(code: string): string {
  return sha256Hex(code);
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export async function createEmailChallenge(input: {
  email: string;
  purpose: ChallengePurpose;
  payload: Record<string, unknown>;
  /** When true, skip sending email (e.g. MFA pending token uses opaque challengeId only). */
  skipEmail?: boolean;
}): Promise<{
  challengeId: string;
  expiresAt: Date;
  emailSent: boolean;
  provider: string;
  verificationCode?: string;
}> {
  const email = input.email.toLowerCase().trim();
  const code = input.skipEmail ? randomBytes(16).toString("hex") : generateOtpCode();
  const challengeId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db
    .update(authChallengesTable)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authChallengesTable.email, email),
        eq(authChallengesTable.purpose, input.purpose),
        isNull(authChallengesTable.consumedAt),
      ),
    );

  await db.insert(authChallengesTable).values({
    challengeId,
    email,
    purpose: input.purpose,
    codeHash: hashCode(code),
    payload: JSON.stringify(input.payload),
    attemptCount: 0,
    expiresAt,
  });

  if (input.skipEmail) {
    return {
      challengeId,
      expiresAt,
      emailSent: false,
      provider: "none",
    };
  }

  const delivery = await sendAuthCodeEmail({
    to: email,
    code,
    purpose: input.purpose === "mfa_login" || input.purpose === "mfa_setup" ? "signup" : input.purpose,
  });

  logger.info(
    {
      email,
      purpose: input.purpose,
      challengeId,
      delivered: delivery.sent,
      provider: delivery.provider,
    },
    "Auth OTP created",
  );

  return {
    challengeId,
    expiresAt,
    emailSent: delivery.sent,
    provider: delivery.provider,
    ...(delivery.devCode ? { verificationCode: delivery.devCode } : {}),
  };
}

export async function verifyEmailChallenge(input: {
  challengeId: string;
  code: string;
  purposes?: ChallengePurpose[];
}): Promise<{ email: string; purpose: ChallengePurpose; payload: Record<string, unknown> }> {
  const challengeId = input.challengeId.trim();
  const code = input.code.trim();
  if (!challengeId || !/^\d{6}$/.test(code)) {
    throw new Error("Enter the 6-digit code from your email");
  }

  const [challenge] = await db
    .select()
    .from(authChallengesTable)
    .where(
      and(
        eq(authChallengesTable.challengeId, challengeId),
        isNull(authChallengesTable.consumedAt),
        gt(authChallengesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!challenge) {
    throw new Error("Invalid or expired verification code");
  }

  if ((challenge.attemptCount || 0) >= MAX_ATTEMPTS) {
    await db
      .update(authChallengesTable)
      .set({ consumedAt: new Date() })
      .where(eq(authChallengesTable.id, challenge.id));
    throw new Error("Too many incorrect attempts. Please request a new code.");
  }

  if (challenge.codeHash !== hashCode(code)) {
    await db
      .update(authChallengesTable)
      .set({ attemptCount: (challenge.attemptCount || 0) + 1 })
      .where(eq(authChallengesTable.id, challenge.id));
    throw new Error("Invalid or expired verification code");
  }

  const purpose = challenge.purpose as ChallengePurpose;
  if (input.purposes && !input.purposes.includes(purpose)) {
    throw new Error("This verification code is no longer valid.");
  }

  await db
    .update(authChallengesTable)
    .set({ consumedAt: new Date() })
    .where(eq(authChallengesTable.id, challenge.id));

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(challenge.payload || "{}") as Record<string, unknown>;
  } catch {
    payload = {};
  }

  return { email: challenge.email, purpose, payload };
}

/** Opaque MFA pending token (not a 6-digit email OTP). */
export async function createOpaqueChallenge(input: {
  email: string;
  purpose: ChallengePurpose;
  payload: Record<string, unknown>;
  ttlMs?: number;
}): Promise<{ challengeId: string; expiresAt: Date }> {
  const email = input.email.toLowerCase().trim();
  const challengeId = randomBytes(24).toString("hex");
  const secret = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + (input.ttlMs || OTP_TTL_MS));

  await db.insert(authChallengesTable).values({
    challengeId,
    email,
    purpose: input.purpose,
    codeHash: hashCode(secret),
    payload: JSON.stringify({ ...input.payload, _secret: secret }),
    attemptCount: 0,
    expiresAt,
  });

  return { challengeId, expiresAt };
}

export async function loadOpaqueChallenge(input: {
  challengeId: string;
  purpose: ChallengePurpose;
}): Promise<{ email: string; payload: Record<string, unknown>; id: number } | null> {
  const [challenge] = await db
    .select()
    .from(authChallengesTable)
    .where(
      and(
        eq(authChallengesTable.challengeId, input.challengeId.trim()),
        eq(authChallengesTable.purpose, input.purpose),
        isNull(authChallengesTable.consumedAt),
        gt(authChallengesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!challenge) return null;
  if ((challenge.attemptCount || 0) >= MAX_ATTEMPTS) return null;

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(challenge.payload || "{}") as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return { email: challenge.email, payload, id: challenge.id };
}

export async function bumpChallengeAttempt(id: number, current: number): Promise<void> {
  const next = current + 1;
  await db
    .update(authChallengesTable)
    .set({
      attemptCount: next,
      ...(next >= MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
    })
    .where(eq(authChallengesTable.id, id));
}

export async function consumeChallengeById(id: number): Promise<void> {
  await db
    .update(authChallengesTable)
    .set({ consumedAt: new Date() })
    .where(eq(authChallengesTable.id, id));
}
