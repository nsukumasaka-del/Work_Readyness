import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Candidate locations for the BonList Android APK (first hit wins). */
export function resolveBonlistApkPath(): string | null {
  const repoRoot = resolve(__dirname, "../../../..");
  const candidates = [
    resolve(repoRoot, "artifacts/careerbridge-sa/public/downloads/BonList.apk"),
    resolve(repoRoot, "mobile/bonlist-android/android/app/build/outputs/apk/debug/app-debug.apk"),
    resolve(repoRoot, "mobile/bonlist-android/android/app/build/outputs/apk/release/app-release-unsigned.apk"),
    process.env.BONLIST_APK_PATH?.trim() || "",
  ].filter(Boolean);

  for (const filePath of candidates) {
    if (existsSync(filePath) && statSync(filePath).isFile() && statSync(filePath).size > 1024) {
      return filePath;
    }
  }
  return null;
}

export function streamBonlistApk(
  res: import("express").Response,
  filePath: string,
): void {
  const size = statSync(filePath).size;
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", 'attachment; filename="BonList.apk"');
  res.setHeader("Content-Length", String(size));
  res.setHeader("Cache-Control", "no-store");
  createReadStream(filePath).pipe(res);
}
