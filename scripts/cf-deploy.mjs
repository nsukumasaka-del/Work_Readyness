/**
 * Cloudflare Worker (static assets) deploy for BonList monorepo.
 * Builds the web app, then runs wrangler deploy with an explicit config
 * (avoids "workspace root" detection errors).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { verifyProductionBuild } from "./verify-web-build.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/careerbridge-sa/dist/public");
const configPath = resolve(root, "wrangler.toml");

process.env.BONLIST_SKIP_MOBILE_POSTBUILD = "1";
process.env.CI = process.env.CI || "true";
process.env.BONLIST_SKIP_WRANGLER_SHIM = "1";

function run(cmd, args) {
  // On Windows, shell:true + an absolute path with spaces (e.g. C:\Program Files\nodejs\node.exe)
  // breaks as 'C:\Program' is not recognized. Only use shell for bare command names (pnpm).
  const needsShell = process.platform === "win32" && !/[\\/]/.test(cmd);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: needsShell,
    env: process.env,
    windowsHide: true,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveWranglerEntry() {
  const require = createRequire(resolve(root, "package.json"));
  try {
    const pkgDir = dirname(require.resolve("wrangler/package.json"));
    const original = resolve(pkgDir, "bin", "wrangler.js.bonlist-original");
    if (existsSync(original)) return original;
    return resolve(pkgDir, "bin", "wrangler.js");
  } catch {
    return null;
  }
}

console.log("[bonlist] Building web app for Cloudflare…");
run("pnpm", ["--filter", "@workspace/careerbridge-sa", "run", "build"]);

if (!existsSync(resolve(outDir, "index.html"))) {
  console.error(`[bonlist] Build output missing: ${outDir}/index.html`);
  process.exit(1);
}

// Never publish source HTML or an entrypoint whose compiled assets are absent.
verifyProductionBuild(outDir);

const otaBundlePath = resolve(outDir, "ota/latest.zip");
const otaManifestPath = resolve(outDir, "ota/manifest.json");
if (!existsSync(otaBundlePath) || !existsSync(otaManifestPath) || statSync(otaBundlePath).size < 4) {
  console.error(`[bonlist] OTA bundle missing or empty: ${otaBundlePath}`);
  process.exit(1);
}
const otaSignature = readFileSync(otaBundlePath).subarray(0, 4);
if (otaSignature[0] !== 0x50 || otaSignature[1] !== 0x4b || ![0x03, 0x05, 0x07].includes(otaSignature[2]) || ![0x04, 0x06, 0x08].includes(otaSignature[3])) {
  console.error(`[bonlist] OTA bundle is not a valid ZIP: ${otaBundlePath}`);
  process.exit(1);
}

const wranglerEntry = resolveWranglerEntry();
console.log(`[bonlist] Verified OTA ZIP (${statSync(otaBundlePath).size} bytes). Deploying Worker static assets from ${outDir}`);

if (wranglerEntry) {
  run(process.execPath, [wranglerEntry, "deploy", "-c", configPath]);
} else {
  run("pnpm", ["exec", "wrangler", "deploy", "-c", configPath]);
}
