import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { verifyPassword } from "./crypto";

const SCRYPT_KEYLEN = 64;

test("verifyPassword accepts legacy scrypt hashes used by the existing app records", async () => {
  const password = "Bohlale.99";
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  const legacyHash = `${salt}:${hash}`;

  const ok = await verifyPassword(password, legacyHash);
  assert.equal(ok, true);
});

test("verifyPassword accepts current PBKDF2 hashes", async () => {
  const password = "Bohlale.99";
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt.toString("hex"), SCRYPT_KEYLEN);
  const legacyHash = `${salt.toString("hex")}:${derived.toString("hex")}`;

  const ok = await verifyPassword(password, legacyHash);
  assert.equal(ok, true);
});
