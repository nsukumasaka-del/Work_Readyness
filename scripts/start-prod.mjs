/**
 * Production all-in-one launcher: build web UI (if needed) and run API with STATIC_DIR.
 * One process serves both the website and /api — use this on Railway/Render/Fly/Docker.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/careerbridge-sa/dist/public");

process.env.BONLIST_SKIP_MOBILE_POSTBUILD = "1";
process.env.CI = process.env.CI || "true";
process.env.PORT = process.env.PORT || "8080";
process.env.DATABASE_URL = process.env.DATABASE_URL || "pglite";
process.env.STATIC_DIR = process.env.STATIC_DIR || outDir;

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(resolve(outDir, "index.html"))) {
  console.log("[bonlist] Building web UI…");
  run("pnpm", ["--filter", "@workspace/careerbridge-sa", "run", "build"]);
}

console.log("[bonlist] Building API…");
run("pnpm", ["--filter", "@workspace/api-server", "run", "build"]);

console.log(`[bonlist] Starting API + web on port ${process.env.PORT}`);
run("pnpm", ["--filter", "@workspace/api-server", "run", "start"]);
