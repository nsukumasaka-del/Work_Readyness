import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variant = process.argv[2] || "debug";
if (!/^(debug|release)$/.test(variant)) throw new Error(`Unsupported APK variant: ${variant}`);
const outputDir = resolve(root, `mobile/bonlist-android/android/app/build/outputs/apk/${variant}`);
const buildMetadata = JSON.parse(readFileSync(resolve(outputDir, "output-metadata.json"), "utf8"));
const release = buildMetadata.elements?.find((entry) => entry.type === "SINGLE");
if (buildMetadata.applicationId !== "com.bonlist.careerbridge") {
  throw new Error(`Unexpected Android application ID: ${buildMetadata.applicationId || "missing"}`);
}
if (!release?.outputFile || !Number.isSafeInteger(release.versionCode) || release.versionCode < 1 || !release.versionName) {
  throw new Error("Android build metadata is missing a valid APK version.");
}
const source = resolve(outputDir, release.outputFile);
if (!existsSync(source)) throw new Error(`Built APK is missing: ${source}`);
const stream = createReadStream(source);
const hash = createHash("sha256");
let fileSizeBytes = 0;
let signature = Buffer.alloc(0);
for await (const chunk of stream) {
  if (signature.length < 4) signature = Buffer.concat([signature, chunk.subarray(0, 4 - signature.length)]);
  fileSizeBytes += chunk.length;
  hash.update(chunk);
}
if (fileSizeBytes < 1024 || signature[0] !== 0x50 || signature[1] !== 0x4b) {
  throw new Error("Built APK is empty or does not have a ZIP signature.");
}
const manifest = {
  applicationId: buildMetadata.applicationId,
  latestVersion: String(release.versionName),
  versionCode: release.versionCode,
  fileSizeBytes,
  checksumSha256: hash.digest("hex"),
  fileName: "BonList.apk",
};
for (const directory of [
  resolve(root, "artifacts/careerbridge-sa/public/downloads"),
  resolve(root, "artifacts/careerbridge-sa/dist/public/downloads"),
]) {
  mkdirSync(directory, { recursive: true });
  copyFileSync(source, resolve(directory, manifest.fileName));
  writeFileSync(resolve(directory, "apk-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`[bonlist] Staged APK ${manifest.latestVersion} (${manifest.versionCode}), ${fileSizeBytes} bytes, SHA-256 ${manifest.checksumSha256}`);
