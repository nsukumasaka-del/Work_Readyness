/**
 * Ensures the shared web dist exists (single UI source for web + Android),
 * then mirrors it into ./www for Capacitor tooling compatibility.
 *
 * Edit UI only in: artifacts/careerbridge-sa
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(__dirname, "..");
const repoRoot = resolve(mobileRoot, "../..");
const webDist = resolve(repoRoot, "artifacts/careerbridge-sa/dist/public");
const www = resolve(mobileRoot, "www");
const wantBuild = process.argv.includes("--build");

function buildWeb() {
  console.log("[bonlist] Building shared web app…");
  const result = spawnSync(
    "pnpm",
    ["--filter", "@workspace/careerbridge-sa", "run", "build"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, BONLIST_SKIP_MOBILE_POSTBUILD: "1" },
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}

if (wantBuild || !existsSync(webDist)) {
  buildWeb();
}

if (!existsSync(webDist)) {
  console.error(`[bonlist] Web dist missing at ${webDist}`);
  process.exit(1);
}

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(webDist, www, { recursive: true });
writeFileSync(
  resolve(mobileRoot, ".web-sync-stamp"),
  JSON.stringify(
    {
      syncedAt: new Date().toISOString(),
      source: webDist,
      note: "Generated — edit artifacts/careerbridge-sa, not www/",
    },
    null,
    2,
  ),
);
console.log(`[bonlist] Shared UI synced: ${webDist} → ${www}`);

// Keep the website Download APK button working: copy latest debug APK if present
const apkSrc = resolve(
  mobileRoot,
  "android/app/build/outputs/apk/debug/app-debug.apk",
);
const apkDestDir = resolve(repoRoot, "artifacts/careerbridge-sa/public/downloads");
const apkDest = resolve(apkDestDir, "BonList.apk");
if (existsSync(apkSrc)) {
  mkdirSync(apkDestDir, { recursive: true });
  cpSync(apkSrc, apkDest);
  console.log(`[bonlist] APK copied → ${apkDest}`);
}
