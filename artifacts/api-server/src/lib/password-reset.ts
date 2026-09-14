import { and, eq, gt, isNull } from "drizzle-orm";
import { db, passwordResetTokensTable, profilesTable } from "@workspace/db";
import { randomToken, sha256Hex } from "./auth-crypto";
import { sendTransactionalEmail } from "./email";
import { revokeAllUserSessions } from "./user-sessions";
import { hashPassword } from "./user-auth";
import { getAppBaseUrl } from "./google-oauth";
import { logger } from "./logger";

const RESET_TTL_MS = 60 * 60 * 1000;

export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = emailRaw.toLowerCase().trim();
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);

  // Always appear successful to prevent account enumeration.
  if (!profile?.passwordHash) {
    logger.info({ email }, "Password reset requested for unknown/unavailable account");
    return;
  }

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokensTable.profileId, profile.id), isNull(passwordResetTokensTable.usedAt)));

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(passwordResetTokensTable).values({
    profileId: profile.id,
    tokenHash: sha256Hex(token),
    expiresAt,
  });

  const resetUrl = `${getAppBaseUrl()}/reset-password?token=${token}`;
  await sendTransactionalEmail({
    to: email,
    subject: "Reset your BonList password",
    text: [
      "We received a request to reset your BonList password.",
      "",
      `Open this link to choose a new password (expires in 1 hour):`,
      resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
        <p>We received a request to reset your BonList password.</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>
        <p style="color:#64748b;font-size:13px">This link expires in 1 hour. If you did not request this, ignore this email.</p>
      </div>
    `,
  });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const [row] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, sha256Hex(token)),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error("This reset link is invalid or has expired.");
  }

  await db
    .update(profilesTable)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(profilesTable.id, row.profileId));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, row.id));

  await revokeAllUserSessions(row.profileId);
}
