/**
 * Ensures the shared web dist exists (single UI source for web + Android),
 * then mirrors it into ./www and verifies Android can pick it up.
 *
 * Edit UI only in: artifacts/careerbridge-sa
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(__dirname, "..");
const repoRoot = resolve(mobileRoot, "../..");
const webDist = resolve(repoRoot, "artifacts/careerbridge-sa/dist/public");
const www = resolve(mobileRoot, "www");
const androidPublic = resolve(
  mobileRoot,
  "android/app/src/main/assets/public",
);
const wantBuild = process.argv.includes("--build");
const wantCapSync = process.argv.includes("--cap-sync");

function hydrateEnvFromDotenv() {
  const envPath = resolve(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

hydrateEnvFromDotenv();

const liveAppUrl = (
  process.env.LIVE_APP_URL ||
  process.env.CAP_SERVER_URL ||
  process.env.VITE_API_BASE_URL ||
  ""
)
  .trim()
  .replace(/\/+$/, "");

function run(cmd, args, cwd, env = {}) {
  // Avoid shell:true with absolute Node paths like "C:\Program Files\nodejs\node.exe"
  const needsShell =
    process.platform === "win32" &&
    !cmd.includes("\\") &&
    !cmd.includes("/") &&
    cmd !== process.execPath;
  return spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: needsShell,
    env: { ...process.env, ...env },
  });
}

function buildWeb() {
  console.log("[bonlist] Building shared web app…");
  if (liveAppUrl) {
    console.log(`[bonlist] Baking API base for Android: ${liveAppUrl}`);
  } else {
    console.warn(
      "[bonlist] LIVE_APP_URL is not set. Signup/API from a bundled APK need it pointing at your deployed site.",
    );
  }
  const result = run(
    "pnpm",
    [
      "--config.manage-package-manager-versions=false",
      "--filter",
      "@workspace/careerbridge-sa",
      "run",
      "build",
    ],
    repoRoot,
    {
      BONLIST_SKIP_MOBILE_POSTBUILD: "1",
      ...(liveAppUrl ? { VITE_API_BASE_URL: liveAppUrl } : {}),
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}

function injectRuntimeConfig() {
  if (!liveAppUrl) return;
  writeFileSync(
    resolve(www, "bonlist-runtime.js"),
    `window.__BONLIST_API_BASE__=${JSON.stringify(liveAppUrl)};\n`,
    "utf8",
  );

  const indexPath = resolve(www, "index.html");
  if (!existsSync(indexPath)) return;
  let html = readFileSync(indexPath, "utf8");
  if (!html.includes("bonlist-runtime.js")) {
    html = html.replace(
      /<head>/i,
      `<head>\n    <script src="/bonlist-runtime.js"></script>`,
    );
    writeFileSync(indexPath, html, "utf8");
  }
  console.log(`[bonlist] Injected runtime API base → ${liveAppUrl}`);
}

function mirrorWebToWww() {
  if (!existsSync(webDist)) {
    console.error(`[bonlist] Web dist missing at ${webDist}`);
    process.exit(1);
  }

  const indexHtml = resolve(webDist, "index.html");
  if (!existsSync(indexHtml)) {
    console.error(`[bonlist] Web dist has no index.html at ${indexHtml}`);
    process.exit(1);
  }

  rmSync(www, { recursive: true, force: true });
  mkdirSync(www, { recursive: true });
  cpSync(webDist, www, { recursive: true });
  // The website offers the APK as a download; bundling that APK inside the
  // Android app makes each subsequent build contain the previous app package.
  rmSync(resolve(www, "downloads/BonList.apk"), { force: true });
  injectRuntimeConfig();

  // Keep Download APK button working when a debug APK exists
  const apkSrc = resolve(
    mobileRoot,
    "android/app/build/outputs/apk/debug/app-debug.apk",
  );
  const apkDestDir = resolve(
    repoRoot,
    "artifacts/careerbridge-sa/public/downloads",
  );
  const apkDest = resolve(apkDestDir, "BonList.apk");
  if (existsSync(apkSrc)) {
    mkdirSync(apkDestDir, { recursive: true });
    cpSync(apkSrc, apkDest);
    console.log(`[bonlist] APK copied → ${apkDest}`);
  }

  const stamp = {
    syncedAt: new Date().toISOString(),
    source: webDist,
    liveAppUrl: liveAppUrl || null,
    note: "Generated — edit artifacts/careerbridge-sa, not www/",
  };
  writeFileSync(
    resolve(mobileRoot, ".web-sync-stamp"),
    JSON.stringify(stamp, null, 2),
  );
  console.log(`[bonlist] Shared UI synced: ${webDist} → ${www}`);
}

function capSyncAndroid() {
  const androidDir = resolve(mobileRoot, "android");
  const nodeModules = resolve(mobileRoot, "node_modules");
  if (!existsSync(androidDir)) {
    console.warn("[bonlist] android/ missing — skipped cap sync.");
    return false;
  }
  if (!existsSync(nodeModules)) {
    console.log("[bonlist] Installing Capacitor deps…");
    const install = run("npm", ["install"], mobileRoot);
    if (install.status !== 0) {
      console.error("[bonlist] npm install failed in mobile/bonlist-android");
      process.exit(install.status || 1);
    }
  }

  const writeConfig = run("node", [resolve(__dirname, "write-capacitor-config.mjs")], mobileRoot);
  if (writeConfig.status !== 0) {
    console.error("[bonlist] Failed to write capacitor.config.json");
    process.exit(writeConfig.status || 1);
  }

  console.log("[bonlist] Running cap sync android…");
  const sync = run("npx", ["cap", "sync", "android"], mobileRoot, {
    BONLIST_SKIP_MOBILE_POSTBUILD: "1",
    ...(liveAppUrl ? { LIVE_APP_URL: liveAppUrl } : {}),
  });
  if (sync.status !== 0) {
    console.error("[bonlist] cap sync android failed");
    process.exit(sync.status || 1);
  }

  const assetIndex = resolve(androidPublic, "index.html");
  if (!existsSync(assetIndex)) {
    console.error(
      `[bonlist] Android assets missing after sync: ${assetIndex}`,
    );
    process.exit(1);
  }

  const wwwIndex = readFileSync(resolve(www, "index.html"), "utf8");
  const assetHtml = readFileSync(assetIndex, "utf8");
  const wwwScript = wwwIndex.match(/assets\/index-[^"]+\.js/)?.[0] || "";
  const assetScript = assetHtml.match(/assets\/index-[^"]+\.js/)?.[0] || "";
  if (wwwScript && assetScript && wwwScript !== assetScript) {
    console.error(
      `[bonlist] Android assets out of sync with www (${wwwScript} vs ${assetScript})`,
    );
    process.exit(1);
  }

  console.log(`[bonlist] Android assets updated → ${androidPublic}`);
  if (wwwScript) console.log(`[bonlist] Web bundle: ${wwwScript}`);
  return true;
}

if (wantBuild || !existsSync(webDist) || !existsSync(resolve(webDist, "index.html"))) {
  buildWeb();
}

mirrorWebToWww();

if (wantCapSync || wantBuild) {
  capSyncAndroid();
}

console.log("[bonlist] Web → Android mirror complete.");
if (!wantCapSync && !wantBuild) {
  console.log(
    "[bonlist] Tip: run `pnpm mobile:sync` from the repo root to also cap-sync + refresh the APK web assets.",
  );
}
