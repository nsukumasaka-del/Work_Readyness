import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inheritedEnvKeys = new Set(Object.keys(process.env));

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Keep shell/host values highest priority; among files, later local files override defaults.
    if (!inheritedEnvKeys.has(key)) process.env[key] = value;
  }
}

loadDotEnv(path.join(root, ".env"));
loadDotEnv(path.join(root, ".env.local"));
loadDotEnv(path.join(root, "artifacts", "api-server", ".env"));

const sharedEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL || "pglite",
};

const processes = [
  {
    name: "api",
    filter: "@workspace/api-server",
    env: {
      ...sharedEnv,
      PORT: process.env.API_PORT || "8080",
    },
  },
  {
    name: "web",
    filter: "@workspace/careerbridge-sa",
    env: {
      ...sharedEnv,
      PORT: process.env.WEB_PORT || "19678",
      BASE_PATH: process.env.BASE_PATH || "/",
      API_PROXY_TARGET: process.env.API_PROXY_TARGET || "http://127.0.0.1:8080",
    },
  },
];

const children = [];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

for (const proc of processes) {
  const child = spawn(
    "pnpm",
    [
      "--config.manage-package-manager-versions=false",
      "--filter",
      proc.filter,
      "run",
      "dev",
    ],
    {
      cwd: root,
      env: proc.env,
      stdio: "inherit",
      shell: true,
    },
  );

  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[${proc.name}] stopped (${signal})`);
      shutdown(1);
      return;
    }
    if (code !== 0 && code !== null) {
      console.error(`[${proc.name}] exited with code ${code}`);
      shutdown(code);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("CareerBridge SA local dev");
console.log(`  API  http://127.0.0.1:${processes[0].env.PORT}/api`);
console.log(`  Web  http://127.0.0.1:${processes[1].env.PORT}/`);
