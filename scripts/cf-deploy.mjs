/**
 * Cloudflare Pages deploy for BonList (monorepo-safe).
 * Build the web app, then deploy the static output with `wrangler pages deploy`
 * (plain `wrangler deploy` fails at the pnpm workspace root).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/careerbridge-sa/dist/public");
const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || "bonlist";

process.env.BONLIST_SKIP_MOBILE_POSTBUILD = "1";
process.env.CI = process.env.CI || "true";

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

console.log("[bonlist] Building web app for Cloudflare Pages…");
run("pnpm", ["--filter", "@workspace/careerbridge-sa", "run", "build"]);

if (!existsSync(resolve(outDir, "index.html"))) {
  console.error(`[bonlist] Build output missing: ${outDir}/index.html`);
  process.exit(1);
}

console.log(`[bonlist] Deploying Pages project "${projectName}" from ${outDir}`);
run("pnpm", [
  "exec",
  "wrangler",
  "pages",
  "deploy",
  outDir,
  "--project-name",
  projectName,
  "--commit-dirty=true",
]);
