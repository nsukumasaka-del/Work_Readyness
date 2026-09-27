import { isNativeApp } from "@/lib/platform";

type StatusBarPlugin = {
  setOverlaysWebView?: (options: { overlay: boolean }) => Promise<void>;
  setBackgroundColor?: (options: { color: string }) => Promise<void>;
  setStyle?: (options: { style: string }) => Promise<void>;
};

/**
 * Draw edge-to-edge in the Android shell; CSS safe-area insets keep controls
 * clear of the status and navigation bars.
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

    await StatusBar.setOverlaysWebView?.({ overlay: true });
    // Keep the status bar transparent so the WebView can render edge-to-edge.
    await StatusBar.setBackgroundColor?.({ color: "#00000000" });
    // Dark icons on a light status bar
    await StatusBar.setStyle?.({ style: "DARK" });
  } catch (error) {
    console.warn("[bonlist] StatusBar setup skipped:", error);
  }
}
