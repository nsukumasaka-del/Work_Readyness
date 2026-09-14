import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SCRYPT_NOTE = "AUTH_ENCRYPTION_KEY";

function resolveEncryptionKey(): Buffer {
  const raw = (process.env.AUTH_ENCRYPTION_KEY || process.env.PRIMARY_ADMIN_PASSWORD || "bonlist-dev-key").trim();
  return createHash("sha256").update(`${SCRYPT_NOTE}:${raw}`).digest();
}

/** Encrypt a short secret (TOTP) with AES-256-GCM. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivHex, tagHex, dataHex] = payload.split(":");
  if (version !== "v1" || !ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", resolveEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(1, local.length));
  return `${visible}***@${domain}`;
}

export function friendlyAuthError(_err: unknown, fallback = "We couldn't complete that request. Please try again."): string {
  return fallback;
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "Member";
  return local
    .replace(/[._+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 80) || "Member";
}
