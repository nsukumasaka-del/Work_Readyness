/**
 * Password hashing for Cloudflare Workers.
 *
 * Current format: pbkdf2$sha256$iterations$saltB64$hashB64
 * Legacy format: salt:hash (Node.js scrypt, used by older BonList records)
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const LEGACY_SCRYPT_KEYLEN = 64;

import { scryptSync, timingSafeEqual } from "node:crypto";

function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]!);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    baseKey,
    KEY_LENGTH * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveKey(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  const pbkdf2Parts = stored.split("$");
  if (pbkdf2Parts.length === 5 && pbkdf2Parts[0] === "pbkdf2" && pbkdf2Parts[1] === "sha256") {
    const iterations = Number(pbkdf2Parts[2]);
    if (!Number.isFinite(iterations) || iterations < 10_000) return false;
    const salt = b64ToBytes(pbkdf2Parts[3]!);
    const expected = b64ToBytes(pbkdf2Parts[4]!);
    const actual = new Uint8Array(await deriveKey(password, salt, iterations));
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
    return diff === 0;
  }

  if (stored.includes(":")) {
    const [salt, hash] = stored.split(":", 2);
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const actual = scryptSync(password, salt, LEGACY_SCRYPT_KEYLEN);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(expected, actual);
  }

  return false;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomId(): string {
  return crypto.randomUUID();
}

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, "0");
}
