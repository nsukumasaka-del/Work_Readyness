import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "artifacts/careerbridge-sa");
const publicDir = resolve(appRoot, "dist/public");
const metaPath = resolve(appRoot, ".ota-build-meta.json");
const require = createRequire(resolve(appRoot, "package.json"));
const JSZip = require("jszip");

if (!existsSync(resolve(publicDir, "index.html")) || !existsSync(metaPath)) {
  throw new Error("The web build or its OTA version metadata is missing.");
}

const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const zip = new JSZip();
function addTree(directory) {
  for (const entry of readdirSync(directory)) {
    if (directory === publicDir && (entry === "ota" || entry === "downloads")) continue;
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) addTree(absolute);
    else zip.file(relative(publicDir, absolute).split(sep).join("/"), readFileSync(absolute));
  }
}
addTree(publicDir);

const otaDir = resolve(publicDir, "ota");
mkdirSync(otaDir, { recursive: true });
const bundle = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 8 } });
if (bundle.length < 4 || bundle[0] !== 0x50 || bundle[1] !== 0x4b || !zip.file("index.html")) {
  throw new Error("The OTA bundle is not a valid ZIP or is missing index.html; refusing to publish an unusable update.");
}
writeFileSync(resolve(otaDir, "latest.zip"), bundle);
const otaChecksum = createHash("sha256").update(bundle).digest("hex");
const manifest = {
  bundleVersion: meta.bundleVersion,
  builtAt: meta.builtAt,
  targetPlatform: meta.targetPlatform,
  requiresNewAPK: meta.requiresNewAPK,
  bundleUrl: `https://www.bonlist.site/ota/latest.zip?v=${encodeURIComponent(meta.bundleVersion)}`,
  otaChecksum,
  bundleSizeBytes: bundle.length,
  releaseNotes: meta.releaseNotes,
};
writeFileSync(resolve(otaDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`[bonlist] OTA bundle packaged (${(bundle.length / 1024 / 1024).toFixed(2)} MB, SHA-256 ${otaChecksum})`);
