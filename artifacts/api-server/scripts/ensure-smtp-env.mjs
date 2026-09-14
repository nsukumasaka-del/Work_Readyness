import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
const text = readFileSync(envPath, "utf8");

if (/^SMTP_HOST=/m.test(text)) {
  console.log("SMTP already in .env");
  process.exit(0);
}

appendFileSync(
  envPath,
  [
    "",
    "# Email verification — set SMTP_PASS to a Gmail App Password, then restart the API",
    "SMTP_HOST=smtp.gmail.com",
    "SMTP_PORT=587",
    "SMTP_USER=nsukumasaka@gmail.com",
    "SMTP_PASS=",
    'SMTP_FROM="BonList <nsukumasaka@gmail.com>"',
    "",
  ].join("\n"),
);

console.log("SMTP placeholders added to .env");
