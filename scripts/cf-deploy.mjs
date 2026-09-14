/**
 * Cloudflare Worker (static assets) deploy for BonList monorepo.
 * Builds the web app, then runs wrangler deploy with an explicit config
 * (avoids "workspace root" detection errors).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/careerbridge-sa/dist/public");
const configPath = resolve(root, "wrangler.toml");

process.env.BONLIST_SKIP_MOBILE_POSTBUILD = "1";
process.env.CI = process.env.CI || "true";
process.env.BONLIST_SKIP_WRANGLER_SHIM = "1";

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
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

const wranglerEntry = resolveWranglerEntry();
console.log(`[bonlist] Deploying Worker static assets from ${outDir}`);

if (wranglerEntry) {
  run(process.execPath, [wranglerEntry, "deploy", "-c", configPath]);
} else {
  run("pnpm", ["exec", "wrangler", "deploy", "-c", configPath]);
}
