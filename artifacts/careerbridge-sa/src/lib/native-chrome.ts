import { isNativeApp } from "@/lib/platform";

type StatusBarPlugin = {
  setOverlaysWebView?: (options: { overlay: boolean }) => Promise<void>;
  setBackgroundColor?: (options: { color: string }) => Promise<void>;
  setStyle?: (options: { style: string }) => Promise<void>;
};

/**
 * Keep the WebView below the system status / navigation bars on phones.
 * Uses the Capacitor StatusBar plugin when running inside the Android shell.
 */
export async function configureNativeChrome(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const plugins = (
      window as Window & {
        Capacitor?: { Plugins?: { StatusBar?: StatusBarPlugin } };
      }
    ).Capacitor?.Plugins;
    const StatusBar = plugins?.StatusBar;
    if (!StatusBar) return;

    await StatusBar.setOverlaysWebView?.({ overlay: false });
    // Match app background (cool white / sky)
    await StatusBar.setBackgroundColor?.({ color: "#F3F8FC" });
    // Dark icons on a light status bar
    await StatusBar.setStyle?.({ style: "DARK" });
  } catch (error) {
    console.warn("[bonlist] StatusBar setup skipped:", error);
  }
}
