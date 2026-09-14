/**
 * Shared platform helpers — same web UI runs in browser and Capacitor Android.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function isAndroidApp(): boolean {
  if (!isNativeApp()) return false;
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  try {
    return cap?.getPlatform?.() === "android";
  } catch {
    return false;
  }
}
