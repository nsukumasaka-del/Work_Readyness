/**
 * Cloudflare Pages build for the BonList web app.
 * - Reinstalls deps without --frozen-lockfile (avoids CF/pnpm override mismatch)
 * - Skips Android/Capacitor postbuild (not available on Cloudflare builders)
 */
import { spawnSync } from "node:child_process";

process.env.BONLIST_SKIP_MOBILE_POSTBUILD = "1";
process.env.CI = process.env.CI || "true";

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Cloudflare already runs install; when SKIP_DEPENDENCY_INSTALL=1 this is the install.
if (process.env.CF_PAGES === "1" || process.env.SKIP_DEPENDENCY_INSTALL === "1") {
  console.log("[bonlist] Cloudflare build: pnpm install --no-frozen-lockfile");
  run("pnpm", ["install", "--no-frozen-lockfile"]);
}

console.log("[bonlist] Building careerbridge-sa for Pages…");
run("pnpm", ["--filter", "@workspace/careerbridge-sa", "run", "build"]);
