/**
 * Makes Cloudflare's default `npx wrangler deploy` work in this pnpm monorepo.
 * Intercepts bare `wrangler deploy` / `wrangler versions upload` and routes them
 * through scripts/cf-deploy.mjs (build + deploy -c wrangler.toml).
 */
import { copyFileSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  let pkgDir;
  try {
    const require = createRequire(join(root, "package.json"));
    pkgDir = dirname(require.resolve("wrangler/package.json"));
  } catch {
    return;
  }

  const bin = join(pkgDir, "bin", "wrangler.js");
  const original = join(pkgDir, "bin", "wrangler.js.bonlist-original");
  if (!existsSync(bin)) return;

  if (!existsSync(original)) {
    copyFileSync(bin, original);
  }

  const deployScript = join(root, "scripts", "cf-deploy.mjs").replace(/\\/g, "/");
  const originalPath = original.replace(/\\/g, "/");

  const shim = `#!/usr/bin/env node
const { spawnSync } = require("child_process");
const args = process.argv.slice(2);

if (process.env.BONLIST_SKIP_WRANGLER_SHIM === "1") {
  const r = spawnSync(process.execPath, [${JSON.stringify(originalPath)}, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(r.status ?? 1);
}

const cmd = args[0];
const isDeploy = cmd === "deploy";
const isVersionsUpload = cmd === "versions" && args[1] === "upload";

if (isDeploy || isVersionsUpload) {
  const r = spawnSync(process.execPath, [${JSON.stringify(deployScript)}], {
    stdio: "inherit",
    env: process.env,
    cwd: ${JSON.stringify(root.replace(/\\/g, "/"))},
  });
  process.exit(r.status ?? 1);
}

const r = spawnSync(process.execPath, [${JSON.stringify(originalPath)}, ...args], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
`;

  writeFileSync(bin, shim, "utf8");
  try {
    chmodSync(bin, 0o755);
  } catch {
    /* windows */
  }
  console.log("[bonlist] Wrangler deploy shim installed (monorepo-safe).");
}

main();
