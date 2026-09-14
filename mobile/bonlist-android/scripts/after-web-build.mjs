/**
 * Runs after the web app builds so Android always tracks the same UI.
 * Non-fatal for plain web deploys: never fails the web build if Capacitor isn't ready.
 * Use `pnpm mobile:sync` when you need a hard guarantee.
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

try {
  const args = [wwwScript];
  // After a real web build, also push into android/assets when the project exists.
  if (existsSync(androidDir)) {
    args.push("--cap-sync");
  }

  const result = spawnSync(process.execPath, args, {
    cwd: mobileRoot,
    stdio: "inherit",
    env: { ...process.env, BONLIST_SKIP_MOBILE_POSTBUILD: "1" },
  });

  if (result.status !== 0) {
    console.warn(
      "[bonlist] Mobile sync after web build did not fully succeed (non-fatal for web). Run: pnpm mobile:sync",
    );
    process.exit(0);
  }

  console.log("[bonlist] Web → Android sync complete.");
} catch (err) {
  console.warn("[bonlist] Mobile postbuild skipped:", err?.message || err);
}
