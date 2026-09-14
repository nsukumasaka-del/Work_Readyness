/**
 * Interactive helper: write a Gmail App Password into repo-root .env as SMTP_PASS.
 * Usage (repo root): node artifacts/api-server/scripts/set-smtp-pass.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const envPath = resolve(root, ".env");

if (!existsSync(envPath)) {
  console.error("Missing .env at", envPath);
  process.exit(1);
}

console.log(`
BonList email setup
-------------------
1) Open https://myaccount.google.com/apppasswords (Google Account must have 2-Step Verification on)
2) Create an app password for "Mail" / BonList
3) Paste the 16-character password below (spaces are OK)

This updates SMTP_PASS in .env and turns OFF AUTH_ALLOW_DEV_OTP.
Restart the API after this (stop pnpm dev and start again).
`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question("Gmail App Password: ", (answer) => {
  rl.close();
  const pass = String(answer || "").replace(/\s+/g, "").trim();
  if (pass.length < 8) {
    console.error("Password looks too short. Aborted.");
    process.exit(1);
  }

  let text = readFileSync(envPath, "utf8");
  if (/^SMTP_PASS=/m.test(text)) {
    text = text.replace(/^SMTP_PASS=.*$/m, `SMTP_PASS=${pass}`);
  } else {
    text += `\nSMTP_PASS=${pass}\n`;
  }
  if (/^AUTH_ALLOW_DEV_OTP=/m.test(text)) {
    text = text.replace(/^AUTH_ALLOW_DEV_OTP=.*$/m, "AUTH_ALLOW_DEV_OTP=false");
  }

  writeFileSync(envPath, text);
  console.log("Updated .env: SMTP_PASS set, AUTH_ALLOW_DEV_OTP=false");
  console.log("Restart the API now, then try Sign up again — the code will arrive by email.");
});
