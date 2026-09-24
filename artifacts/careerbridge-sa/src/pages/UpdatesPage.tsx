import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, RefreshCw, Smartphone } from "lucide-react";
import { apiUrl } from "@/lib/api-base";
import { isAndroidApp } from "@/lib/platform";

type Release = { latestVersion: string; versionCode: number; apkUrl: string; releaseNotes: string };
const FALLBACK_VERSION = "1.0.0";
const FALLBACK_VERSION_CODE = 1;

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        App?: { getInfo?: () => Promise<{ version?: string; build?: string }> };
        ApkInstaller?: { installApk?: (options: { url: string }) => Promise<{ started: boolean; permissionRequired?: boolean }> };
      };
    };
  }
}

async function getInstalledVersion() {
  try {
    const info = await window.Capacitor?.Plugins?.App?.getInfo?.();
    return {
      version: info?.version || FALLBACK_VERSION,
      code: Number(info?.build) || FALLBACK_VERSION_CODE,
    };
  } catch {
    return { version: FALLBACK_VERSION, code: FALLBACK_VERSION_CODE };
  }
}

export function isReleaseNewer(release: Release, installed: { version: string; code: number }) {
  if (Number.isFinite(release.versionCode) && release.versionCode > 0 && installed.code > 0) {
    return release.versionCode > installed.code;
  }
  const parts = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const latest = parts(release.latestVersion);
  const current = parts(installed.version);
  for (let index = 0; index < Math.max(latest.length, current.length); index += 1) {
    if ((latest[index] || 0) !== (current[index] || 0)) return (latest[index] || 0) > (current[index] || 0);
  }
  return false;
}

export async function fetchAndroidRelease(): Promise<Release> {
  const response = await fetch(apiUrl("/api/app/version"), { cache: "no-store" });
  if (!response.ok) throw new Error(`Update service returned ${response.status}.`);
  const value = await response.json();
  if (!value || typeof value.latestVersion !== "string" || !Number.isFinite(Number(value.versionCode))) {
    throw new Error("The update service returned invalid version information.");
  }
  return {
    latestVersion: value.latestVersion,
    versionCode: Number(value.versionCode),
    apkUrl: String(value.apkUrl || ""),
    releaseNotes: String(value.releaseNotes || "No release notes provided."),
  };
}

export async function installAndroidRelease(apkUrl: string) {
  if (!isAndroidApp()) {
    window.open(apkUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const installer = window.Capacitor?.Plugins?.ApkInstaller?.installApk;
  if (!installer) throw new Error("The APK installer is unavailable. Update BonList from the Play Store or reinstall the latest APK.");
  const result = await installer({ url: apkUrl });
  if (result?.permissionRequired) throw new Error("Allow BonList to install apps in Android settings, then tap Install Update again.");
}

export function UpdatesPage() {
  const [installed, setInstalled] = useState({ version: FALLBACK_VERSION, code: FALLBACK_VERSION_CODE });
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  const checkForUpdates = useCallback(async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const [current, available] = await Promise.all([getInstalledVersion(), fetchAndroidRelease()]);
      setInstalled(current); setRelease(available);
      if (!isReleaseNewer(available, current)) setMessage("You have the latest version installed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check for updates.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void checkForUpdates(); }, [checkForUpdates]);

  const install = async () => {
    if (!release?.apkUrl) return;
    setInstalling(true); setError("");
    try { await installAndroidRelease(release.apkUrl); setMessage("The APK is downloading. Android will prompt you to install it when the download finishes."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not start the APK installer."); }
    finally { setInstalling(false); }
  };

  const updateAvailable = release ? isReleaseNewer(release, installed) : false;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Smartphone size={22} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground md:text-2xl">App updates</h1>
            <p className="mt-1 text-base text-muted-foreground md:text-sm">Check your installed BonList Android app and review the latest release.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 rounded-2xl bg-secondary/40 p-4 sm:grid-cols-2">
          <p className="text-base text-foreground md:text-sm"><span className="font-semibold">Installed version:</span> v{installed.version} (build {installed.code})</p>
          <p className="text-base text-foreground md:text-sm"><span className="font-semibold">Latest version:</span> {release ? `v${release.latestVersion} (build ${release.versionCode})` : "Not checked"}</p>
        </div>
        {release && <div className="mt-5"><h2 className="font-semibold text-foreground">Release notes</h2><p className="mt-1 whitespace-pre-line text-base text-muted-foreground md:text-sm">{release.releaseNotes}</p></div>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={17} />{message}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void checkForUpdates()} disabled={loading} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "Checking…" : "Check for Updates"}
          </button>
          {release && updateAvailable && <button type="button" onClick={() => void install()} disabled={installing || !release.apkUrl} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-105 disabled:opacity-60">
            <Download size={16} />{installing ? "Starting installer…" : isAndroidApp() ? "Install Update" : "Download APK"}
          </button>}
        </div>
        {!isAndroidApp() && <p className="mt-4 text-xs text-muted-foreground">APK installation is available in the BonList Android app. This page can still check the published release.</p>}
      </div>
    </main>
  );
}

export function AppUpdatePrompt() {
  const [release, setRelease] = useState<Release | null>(null);
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    if (!isAndroidApp()) return;
    let active = true;
    void Promise.all([getInstalledVersion(), fetchAndroidRelease()]).then(([current, available]) => {
      if (active && isReleaseNewer(available, current) && sessionStorage.getItem("bonlist-update-later") !== available.latestVersion) setRelease(available);
    }).catch((err) => console.error("App update check failed:", err));
    return () => { active = false; };
  }, []);
  if (!release) return null;
  return (
    <div className="fixed inset-0 z-[250] grid place-items-center bg-slate-950/70 p-4" role="presentation">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="app-update-title">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Download size={20} /></span><h2 id="app-update-title" className="text-lg font-bold text-foreground">BonList update available</h2></div>
        <p className="mt-4 text-sm text-foreground">A new update (v{release.latestVersion}) is available. Would you like to install it now?</p>
        <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{release.releaseNotes}</p>
        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => { sessionStorage.setItem("bonlist-update-later", release.latestVersion); setRelease(null); }} className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm font-semibold">Later</button>
          <button type="button" disabled={installing || !release.apkUrl} onClick={() => { setInstalling(true); void installAndroidRelease(release.apkUrl).catch((err) => setError(err instanceof Error ? err.message : "Could not start the installer.")).finally(() => setInstalling(false)); }} className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">{installing ? "Starting…" : "Install Update"}</button>
        </div>
      </section>
    </div>
  );
}
