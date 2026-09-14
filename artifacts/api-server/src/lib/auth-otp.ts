import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authChallengesTable, db } from "@workspace/db";
import { sendAuthCodeEmail } from "./email";
import { logger } from "./logger";

const OTP_TTL_MS = 10 * 60 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export async function createEmailChallenge(input: {
  email: string;
  purpose: "signup";
  payload: Record<string, unknown>;
}): Promise<{ challengeId: string; expiresAt: Date; emailSent: boolean; provider: string }> {
  const email = input.email.toLowerCase().trim();
  const code = generateOtpCode();
  const challengeId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Invalidate older unused challenges for this email/purpose.
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
    expiresAt,
  });

  const delivery = await sendAuthCodeEmail({
    to: email,
    code,
    purpose: input.purpose,
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

  // Never attach the raw code to the return value for API clients.
  // Dev codes (if AUTH_ALLOW_DEV_OTP) are only written to server logs above.
  if (delivery.devCode) {
    logger.warn({ challengeId }, "Dev OTP available in server logs only — not returned to the client");
  }

  return {
    challengeId,
    expiresAt,
    emailSent: delivery.sent,
    provider: delivery.provider,
  };
}

export async function verifyEmailChallenge(input: {
  challengeId: string;
  code: string;
}): Promise<{ email: string; purpose: "signup"; payload: Record<string, unknown> }> {
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

  if (!challenge || challenge.codeHash !== hashCode(code)) {
    throw new Error("Invalid or expired verification code");
  }

  if (challenge.purpose !== "signup") {
    throw new Error("This verification code is no longer valid. Please log in with your password.");
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

  return {
    email: challenge.email,
    purpose: "signup" as const,
    payload,
  };
}
