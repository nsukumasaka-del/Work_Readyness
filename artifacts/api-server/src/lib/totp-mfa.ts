import { Secret, TOTP } from "otpauth";
import { randomBytes, randomInt } from "node:crypto";
import QRCode from "qrcode";
import { and, eq, isNull } from "drizzle-orm";
import { db, mfaRecoveryCodesTable } from "@workspace/db";
import { decryptSecret, encryptSecret, sha256Hex } from "./auth-crypto";

const ISSUER = "BonList";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotp(secretBase32: string, accountName: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function verifyTotpCode(secretBase32: string, code: string, accountName = "user"): boolean {
  if (!/^\d{6}$/.test(code.trim())) return false;
  const totp = buildTotp(secretBase32, accountName);
  const delta = totp.validate({ token: code.trim(), window: 1 });
  return delta !== null;
}

export async function totpQrDataUrl(secretBase32: string, accountName: string): Promise<{ uri: string; qrDataUrl: string }> {
  const totp = buildTotp(secretBase32, accountName);
  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { uri, qrDataUrl };
}

export function sealTotpSecret(secretBase32: string): string {
  return encryptSecret(secretBase32);
}

export function openTotpSecret(enc: string): string {
  return decryptSecret(enc);
}

export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const partA = randomBytes(2).toString("hex");
    const partB = randomBytes(2).toString("hex");
    const partC = String(randomInt(1000, 9999));
    codes.push(`${partA}-${partB}-${partC}`.toUpperCase());
  }
  return codes;
}

export async function replaceRecoveryCodes(profileId: number, codes: string[]): Promise<void> {
  await db.delete(mfaRecoveryCodesTable).where(eq(mfaRecoveryCodesTable.profileId, profileId));
  if (codes.length === 0) return;
  await db.insert(mfaRecoveryCodesTable).values(
    codes.map((code) => ({
      profileId,
      codeHash: sha256Hex(normalizeRecoveryCode(code)),
    })),
  );
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export async function consumeRecoveryCode(profileId: number, code: string): Promise<boolean> {
  const hash = sha256Hex(normalizeRecoveryCode(code));
  const [row] = await db
    .select()
    .from(mfaRecoveryCodesTable)
    .where(
      and(
        eq(mfaRecoveryCodesTable.profileId, profileId),
        eq(mfaRecoveryCodesTable.codeHash, hash),
        isNull(mfaRecoveryCodesTable.usedAt),
      ),
    )
    .limit(1);
  if (!row) return false;
  await db
    .update(mfaRecoveryCodesTable)
    .set({ usedAt: new Date() })
    .where(eq(mfaRecoveryCodesTable.id, row.id));
  return true;
}

export async function countUnusedRecoveryCodes(profileId: number): Promise<number> {
  const rows = await db
    .select()
    .from(mfaRecoveryCodesTable)
    .where(and(eq(mfaRecoveryCodesTable.profileId, profileId), isNull(mfaRecoveryCodesTable.usedAt)));
  return rows.length;
}
