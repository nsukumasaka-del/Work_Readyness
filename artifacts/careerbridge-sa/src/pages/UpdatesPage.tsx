import { useCallback, useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { CheckCircle2, Download, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { apiUrl } from "@/lib/api-base";

type TargetPlatform = "all" | "web-only" | "native-apk-required";
type Release = {
  latestVersion: string;
  versionCode: number;
  apkUrl: string;
  bundleVersion: string;
  bundleUrl: string;
  targetPlatform: TargetPlatform;
  requiresNewAPK: boolean;
  releaseNotes: string;
};
type Installed = { version: string; code: number; bundleVersion: string };

const FALLBACK_VERSION = "1.0.0";
const FALLBACK_VERSION_CODE = 1;
const ACTIVE_BUNDLE_KEY = "bonlist-active-bundle-version";
const isAndroidApk = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        ApkInstaller?: { installApk?: (options: { url: string }) => Promise<{ started: boolean; permissionRequired?: boolean }> };
      };
    };
  }
}

async function getInstalledVersion(): Promise<Installed> {
  let version = FALLBACK_VERSION;
  let code = FALLBACK_VERSION_CODE;
  let bundleVersion = __BONLIST_BUNDLE_VERSION__ || "unknown";
  if (isAndroidApk()) {
    try {
      const info = await App.getInfo();
      version = info.version || version;
      code = Number(info.build) || code;
    } catch { /* Keep the web-bundle fallback for older APK shells. */ }
    try {
      const current = await CapacitorUpdater.current();
      const currentVersion = current.bundle?.version;
      if (currentVersion && !/^builtin$/i.test(currentVersion)) bundleVersion = currentVersion;
      else {
        const stored = localStorage.getItem(ACTIVE_BUNDLE_KEY);
        if (stored) bundleVersion = stored;
      }
    } catch {
      const stored = localStorage.getItem(ACTIVE_BUNDLE_KEY);
      if (stored) bundleVersion = stored;
    }
  }
  return { version, code, bundleVersion };
}

export function isReleaseNewer(release: Pick<Release, "latestVersion" | "versionCode">, installed: Pick<Installed, "version" | "code">) {
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
  const targetPlatform: TargetPlatform = ["all", "web-only", "native-apk-required"].includes(value.targetPlatform)
    ? value.targetPlatform
    : "all";
  return {
    latestVersion: value.latestVersion,
    versionCode: Number(value.versionCode),
    apkUrl: String(value.apkUrl || ""),
    bundleVersion: String(value.bundleVersion || ""),
    bundleUrl: String(value.bundleUrl || ""),
    targetPlatform,
    requiresNewAPK: Boolean(value.requiresNewAPK),
    releaseNotes: String(value.releaseNotes || "No release notes provided."),
  };
}

function apkUpdateRequired(release: Release, installed: Installed) {
  return release.targetPlatform === "native-apk-required" ||
    isReleaseNewer(release, installed) ||
    (release.requiresNewAPK && installed.code < release.versionCode);
}

function hasOtaUpdate(release: Release, installed: Installed) {
  return isAndroidApk() && release.targetPlatform === "all" && !apkUpdateRequired(release, installed) &&
    Boolean(release.bundleVersion && release.bundleUrl && release.bundleVersion !== installed.bundleVersion);
}

async function installAndroidRelease(apkUrl: string) {
  if (!isAndroidApk()) {
    window.open(apkUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const installer = window.Capacitor?.Plugins?.ApkInstaller?.installApk;
  if (!installer) throw new Error("The APK installer is unavailable. Update BonList from the Play Store or reinstall the latest APK.");
  const result = await installer({ url: apkUrl });
  if (result?.permissionRequired) throw new Error("Allow BonList to install apps in Android settings, then tap Install Update again.");
}

async function syncAndApplyOta(release: Release) {
  if (!isAndroidApk()) throw new Error("Over-the-air updates are available only in the BonList Android app.");
  if (release.targetPlatform !== "all") throw new Error("This release is not an OTA-compatible web bundle.");
  if (!release.bundleUrl || !release.bundleVersion) throw new Error("The update service has no web bundle for this release.");
  const bundle = await CapacitorUpdater.download({ url: release.bundleUrl, version: release.bundleVersion });
  const reloadNow = window.confirm("The update is downloaded. Reload BonList now to apply it?");
  if (reloadNow) {
    localStorage.setItem(ACTIVE_BUNDLE_KEY, release.bundleVersion);
    // `set` activates the verified bundle and reloads the native WebView.
    await CapacitorUpdater.set({ id: bundle.id });
    return true;
  }
  await CapacitorUpdater.next({ id: bundle.id });
  return false;
}

function UpdateAction({ release, installed, busy, onError, onBusy, onComplete }: {
  release: Release;
  installed: Installed;
  busy: boolean;
  onError: (message: string) => void;
  onBusy: (value: boolean) => void;
  onComplete?: (message: string) => void;
}) {
  const apkRequired = apkUpdateRequired(release, installed);
  const otaAvailable = hasOtaUpdate(release, installed);
  if (!apkRequired && !otaAvailable) return null;
  const apply = async () => {
    onBusy(true); onError("");
    try {
      if (apkRequired) await installAndroidRelease(release.apkUrl);
      else {
        const appliedImmediately = await syncAndApplyOta(release);
        if (!appliedImmediately) onComplete?.("Bundle downloaded. It will apply the next time BonList reloads.");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not apply this update.");
    } finally { onBusy(false); }
  };
  return (
    <button type="button" onClick={() => void apply()} disabled={busy || (apkRequired && !release.apkUrl) || (otaAvailable && !release.bundleUrl)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-105 disabled:opacity-60">
      {apkRequired ? <Download size={16} /> : <Wifi size={16} />}
      {busy ? (apkRequired ? "Starting installer…" : "Downloading & applying…") : apkRequired ? (isAndroidApk() ? "Install APK Update" : "Download APK") : "Sync & Apply Update"}
    </button>
  );
}

export function UpdatesPage() {
  const [installed, setInstalled] = useState<Installed>({ version: FALLBACK_VERSION, code: FALLBACK_VERSION_CODE, bundleVersion: __BONLIST_BUNDLE_VERSION__ || "unknown" });
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const checkForUpdates = useCallback(async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const [current, available] = await Promise.all([getInstalledVersion(), fetchAndroidRelease()]);
      setInstalled(current); setRelease(available);
      if (isAndroidApk() && available.targetPlatform === "web-only") setMessage("This web-only release does not apply to the Android APK.");
      else if (!apkUpdateRequired(available, current) && !hasOtaUpdate(available, current)) setMessage("You have the latest app and web bundle.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check for updates.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void checkForUpdates(); }, [checkForUpdates]);
  const [actionError, setActionError] = useState("");
  const showActionError = (value: string) => { setActionError(value); setError(value); };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Smartphone size={22} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground md:text-2xl">App updates</h1>
            <p className="mt-1 text-base text-muted-foreground md:text-sm">Check the installed BonList app and sync live web bundles.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 rounded-2xl bg-secondary/40 p-4 sm:grid-cols-2">
          <p className="text-base text-foreground md:text-sm"><span className="font-semibold">Installed APK:</span> v{installed.version} (build {installed.code})</p>
          <p className="text-base text-foreground md:text-sm"><span className="font-semibold">Active web bundle:</span> {installed.bundleVersion}</p>
          <p className="text-base text-foreground md:text-sm"><span className="font-semibold">Latest APK:</span> {release ? `v${release.latestVersion} (build ${release.versionCode})` : "Not checked"}</p>
          <p className="text-base text-foreground md:text-sm"><span className="font-semibold">Latest web bundle:</span> {release?.bundleVersion || "Not checked"}</p>
        </div>
        {release && <div className="mt-5"><h2 className="font-semibold text-foreground">Release notes</h2><p className="mt-1 whitespace-pre-line text-base text-muted-foreground md:text-sm">{release.releaseNotes}</p><p className="mt-2 text-xs text-muted-foreground">Target: {release.targetPlatform}{release.requiresNewAPK ? " · Native APK update required for older builds" : " · OTA compatible"}</p></div>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={17} />{message}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void checkForUpdates()} disabled={loading} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "Checking…" : "Check for Updates"}
          </button>
          {release ? <UpdateAction release={release} installed={installed} busy={busy} onBusy={setBusy} onError={showActionError} onComplete={setMessage} /> : null}
        </div>
        {!isAndroidApk() && <p className="mt-4 text-xs text-muted-foreground">APK installation and over-the-air bundle sync are available inside the BonList Android app.</p>}
        {actionError ? <p className="sr-only" aria-live="assertive">{actionError}</p> : null}
      </div>
    </main>
  );
}

export function AppUpdatePrompt() {
  const [release, setRelease] = useState<Release | null>(null);
  const [installed, setInstalled] = useState<Installed | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isAndroidApk()) return;
    let active = true;
    void Promise.all([getInstalledVersion(), fetchAndroidRelease()]).then(([current, available]) => {
      const applicable = available.targetPlatform !== "web-only" && (apkUpdateRequired(available, current) || hasOtaUpdate(available, current));
      if (active && applicable && sessionStorage.getItem("bonlist-update-later") !== `${available.latestVersion}:${available.bundleVersion}`) {
        setInstalled(current); setRelease(available);
      }
    }).catch((err) => console.error("App update check failed:", err));
    return () => { active = false; };
  }, []);
  if (!release || !installed) return null;
  const versionKey = `${release.latestVersion}:${release.bundleVersion}`;
  const close = () => { sessionStorage.setItem("bonlist-update-later", versionKey); setRelease(null); };
  return (
    <div className="fixed inset-0 z-[250] grid place-items-center bg-slate-950/70 p-4" role="presentation">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="app-update-title">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Download size={20} /></span><h2 id="app-update-title" className="text-lg font-bold text-foreground">BonList update available</h2></div>
        <p className="mt-4 text-sm text-foreground">{apkUpdateRequired(release, installed) ? `A new APK (v${release.latestVersion}) is available.` : "A new BonList web bundle is ready to sync."}</p>
        <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{release.releaseNotes}</p>
        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={close} className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm font-semibold">Later</button>
          <UpdateAction release={release} installed={installed} busy={busy} onBusy={setBusy} onError={setError} />
        </div>
      </section>
    </div>
  );
}
