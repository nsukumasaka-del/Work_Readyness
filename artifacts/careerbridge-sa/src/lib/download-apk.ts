/**
 * Instant Android APK download from the static public file.
 * Served from artifacts/careerbridge-sa/public/downloads/BonList.apk
 */
export const ANDROID_APK_URL = "/downloads/BonList.apk";

/** Starts the browser download immediately — no SPA navigation, no preflight. */
export function triggerAndroidApkDownload(): void {
  const anchor = document.createElement("a");
  anchor.href = `${ANDROID_APK_URL}?t=${Date.now()}`;
  anchor.download = "BonList.apk";
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
