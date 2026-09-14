/**
 * Runs after the web app builds so Android always tracks the same UI.
 * Non-fatal: never fails the web build if Capacitor/Android isn't ready.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.env.BONLIST_SKIP_MOBILE_POSTBUILD === "1") {
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(__dirname, "..");
const wwwScript = resolve(__dirname, "sync-web.mjs");
const androidDir = resolve(mobileRoot, "android");
const nodeModules = resolve(mobileRoot, "node_modules");

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, BONLIST_SKIP_MOBILE_POSTBUILD: "1" },
  });
}

try {
  // Mirror dist → www (webDir also points at dist for a single source)
  const mirror = run("node", [wwwScript], mobileRoot);
  if (mirror.status !== 0) {
    console.warn("[bonlist] Mobile www mirror skipped/failed (non-fatal).");
    process.exit(0);
  }

  if (!existsSync(androidDir) || !existsSync(nodeModules)) {
    console.log("[bonlist] Android project not ready — skipped cap sync.");
    process.exit(0);
  }

  const sync = run("npx", ["cap", "sync", "android"], mobileRoot);
  if (sync.status !== 0) {
    console.warn("[bonlist] cap sync android failed (non-fatal). Run: pnpm mobile:sync");
    process.exit(0);
  }

  console.log("[bonlist] Web → Android sync complete.");
} catch (err) {
  console.warn("[bonlist] Mobile postbuild skipped:", err?.message || err);
}
