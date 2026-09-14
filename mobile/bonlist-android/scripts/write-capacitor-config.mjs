/**
 * Writes capacitor.config.json from env (LIVE_APP_URL / CAP_LIVE_RELOAD).
 * Capacitor CLI on Windows is unreliable with capacitor.config.ts ESM.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(__dirname, "..");
const repoRoot = resolve(mobileRoot, "../..");

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

const liveReload =
  process.env.CAP_LIVE_RELOAD === "1"
    ? (process.env.CAP_LIVE_RELOAD_URL || "").trim()
    : "";
const liveApp = (
  process.env.LIVE_APP_URL ||
  process.env.CAP_SERVER_URL ||
  process.env.VITE_API_BASE_URL ||
  ""
).trim();
const serverUrl = (liveReload || liveApp).replace(/\/+$/, "");

const config = {
  appId: "com.bonlist.careerbridge",
  appName: "BonList",
  webDir: "www",
  server: {
    androidScheme: "https",
    ...(serverUrl
      ? {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        }
      : {}),
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0F172A",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#F3F8FC",
      overlaysWebView: false,
    },
  },
  android: {
    allowMixedContent: true,
  },
};

const outPath = resolve(mobileRoot, "capacitor.config.json");
writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(
  `[bonlist] Wrote ${outPath}${serverUrl ? ` (server.url=${serverUrl})` : " (bundled www)"}`,
);
