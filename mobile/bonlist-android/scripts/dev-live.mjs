/**
 * Dev live-reload: Android WebView loads the running Vite/web server
 * so edits in artifacts/careerbridge-sa appear instantly on device/emulator.
 *
 * Usage (repo root):
 *   1. pnpm dev   (or start the web app)
 *   2. pnpm mobile:dev
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(__dirname, "..");
const liveUrl = (process.env.CAP_LIVE_RELOAD_URL || "http://10.0.2.2:19678").trim();

console.log("[bonlist] Syncing Android to live web server:", liveUrl);
console.log("[bonlist] Emulator → use 10.0.2.2:<port>; physical device → use your PC LAN IP.");

const write = spawnSync("node", [resolve(__dirname, "write-capacitor-config.mjs")], {
  cwd: mobileRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    CAP_LIVE_RELOAD: "1",
    CAP_LIVE_RELOAD_URL: liveUrl,
  },
});
if (write.status !== 0) process.exit(write.status || 1);

const result = spawnSync("npx", ["cap", "sync", "android"], {
  cwd: mobileRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    CAP_LIVE_RELOAD: "1",
    CAP_LIVE_RELOAD_URL: liveUrl,
  },
});

if (result.status !== 0) process.exit(result.status || 1);

console.log("[bonlist] Next: npm --prefix mobile/bonlist-android run cap:open  (Run app in Android Studio)");
