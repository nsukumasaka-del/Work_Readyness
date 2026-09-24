import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "../artifacts/careerbridge-sa");
const date = new Date();
const pad = (value) => String(value).padStart(2, "0");
const bundleVersion = `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}.${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
const truthy = (value) => ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
const meta = {
  bundleVersion,
  builtAt: date.toISOString(),
  targetPlatform: process.env.OTA_TARGET_PLATFORM || "all",
  requiresNewAPK: truthy(process.env.OTA_REQUIRES_NEW_APK),
  releaseNotes: process.env.OTA_RELEASE_NOTES || "Live web code and interface updates.",
};

writeFileSync(resolve(appRoot, ".ota-build-meta.json"), JSON.stringify(meta, null, 2) + "\n");
console.log(`[bonlist] OTA bundle version: ${bundleVersion}`);
