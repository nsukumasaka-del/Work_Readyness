import { useCallback, useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { CheckCircle2, Download, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { fetchAppUpdateMetadata, type AppUpdateMetadata } from "@/api/updateCheck";

type Release = AppUpdateMetadata;
type Installed = { version: string; code: number; bundleVersion: string };

const FALLBACK_VERSION = "1.0.0";
const FALLBACK_VERSION_CODE = 1;
const ACTIVE_BUNDLE_KEY = "bonlist-active-bundle-version";
const isAndroidApk = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

type ApkInstallEvent = { message?: string; percent?: number };
type ApkInstallerApi = {
  installApk: (options: { url: string; expectedVersionCode: number; fileSizeBytes: number; checksumSha256: string }) => Promise<{ started: boolean; permissionRequired?: boolean; downloadId?: number }>;
  addListener: (eventName: string, listener: (event: ApkInstallEvent) => void) => Promise<{ remove: () => Promise<void> }>;
};
const ApkInstaller = registerPlugin<ApkInstallerApi>("ApkInstaller");

async function getInstalledVersion(): Promise<Installed> {
  let version = FALLBACK_VERSION;
  let code = isAndroidApk() ? 0 : FALLBACK_VERSION_CODE;
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
  return Number.isSafeInteger(release.versionCode) && Number.isSafeInteger(installed.code) &&
    installed.code > 0 && release.versionCode > installed.code;
}

export async function fetchAndroidRelease(): Promise<Release> {
  return fetchAppUpdateMetadata();
}

function apkUpdateRequired(release: Release, installed: Installed) {
  return release.apkAvailable && Boolean(release.apkUrl) && isReleaseNewer(release, installed);
}

function hasOtaUpdate(release: Release, installed: Installed) {
  return isAndroidApk() && release.targetPlatform === "all" && !apkUpdateRequired(release, installed) &&
    Boolean(release.bundleVersion && release.bundleUrl && release.otaChecksum &&
      release.bundleVersion !== installed.bundleVersion);
}

async function installAndroidRelease(
  release: Release,
  installedCode: number,
  callbacks: { onError: (message: string) => void; onComplete?: (message: string) => void; onProgress?: (percent: number | null) => void },
) {
  if (!release.apkAvailable || !isReleaseNewer(release, { version: "", code: installedCode })) {
    throw new Error("No newer verified APK is available for this device.");
  }
  const resolvedUrl = new URL(release.apkUrl, isAndroidApk() ? "https://www.bonlist.site/" : window.location.href);
  if (resolvedUrl.protocol === "http:" && /(^|\.)bonlist\.site$/i.test(resolvedUrl.hostname)) {
    resolvedUrl.protocol = "https:";
  }
  if (resolvedUrl.protocol !== "https:") throw new Error("APK updates require a secure HTTPS download URL.");
  resolvedUrl.searchParams.set("t", String(Date.now()));
  if (!isAndroidApk()) {
    window.open(resolvedUrl.toString(), "_blank", "noopener,noreferrer");
    return;
  }
  const handles: Array<{ remove: () => Promise<void> }> = [];
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let nativeFinished = false;
  const cleanup = () => {
    if (cleanupTimer) clearTimeout(cleanupTimer);
    void Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)));
  };
  try {
    handles.push(await ApkInstaller.addListener("apkInstallError", (event: ApkInstallEvent) => {
      nativeFinished = true;
      callbacks.onError(event.message || "Android could not install the APK update.");
      callbacks.onProgress?.(null);
      cleanup();
    }));
    handles.push(await ApkInstaller.addListener("apkDownloadProgress", (event: ApkInstallEvent) => {
      if (typeof event.percent === "number") callbacks.onProgress?.(event.percent);
    }));
    handles.push(await ApkInstaller.addListener("apkDownloadComplete", () => {
      nativeFinished = true;
      callbacks.onProgress?.(100);
      callbacks.onComplete?.("APK downloaded. Confirm the Android installation prompt.");
      cleanup();
    }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      ApkInstaller.installApk({
        url: resolvedUrl.toString(),
        expectedVersionCode: release.versionCode,
        fileSizeBytes: release.fileSizeBytes,
        checksumSha256: release.checksumSha256,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Android did not respond while starting the APK download. Please try again.")), 20_000);
      }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    if (result.permissionRequired) {
      throw new Error("Allow BonList to install apps in Android settings, then tap Install APK Update again.");
    }
    if (!result.started) throw new Error("Android did not start the APK download.");
    if (!nativeFinished) {
      callbacks.onComplete?.("APK download started. Android will open the installer when it is ready.");
      cleanupTimer = setTimeout(cleanup, 16 * 60_000);
    }
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function syncAndApplyOta(release: Release, onProgress?: (percent: number | null) => void) {
  if (!isAndroidApk()) throw new Error("Over-the-air updates are available only in the BonList Android app.");
  if (release.targetPlatform !== "all") throw new Error("This release is not an OTA-compatible web bundle.");
  if (!release.bundleUrl || !release.bundleVersion) throw new Error("The update service has no web bundle for this release.");
  if (!/^[a-f0-9]{64}$/i.test(release.otaChecksum)) {
    throw new Error("The OTA bundle has no valid SHA-256 checksum. Install the latest BonList APK first.");
  }
  const bundleUrl = new URL(release.bundleUrl);
  const trustedOtaHost = bundleUrl.hostname === "bonlist.site"
    || bundleUrl.hostname.endsWith(".bonlist.site")
    || bundleUrl.hostname.endsWith(".workers.dev");
  // Upgrade legacy Cloudflare/BonList HTTP manifests to TLS. Never download
  // executable app content over cleartext from an arbitrary host.
  if (bundleUrl.protocol === "http:" && trustedOtaHost) bundleUrl.protocol = "https:";
  if (bundleUrl.protocol !== "https:") {
    throw new Error(`OTA download requires HTTPS; received ${bundleUrl.protocol}//${bundleUrl.hostname}.`);
  }
  let bundle: Awaited<ReturnType<typeof CapacitorUpdater.download>>;
  const listenerHandles: Array<{ remove: () => Promise<void> }> = [];
  const safeBundleUrl = `${bundleUrl.origin}${bundleUrl.pathname}`;
  const downloadUrl = bundleUrl.toString();
  console.log("[OTA] Downloading bundle from:", safeBundleUrl);
  console.info("[CapacitorUpdater] Starting native OTA download without a browser preflight", {
    platform: Capacitor.getPlatform(),
    bundleVersion: release.bundleVersion,
    checksum: release.otaChecksum,
    url: safeBundleUrl,
    responseTimeoutSeconds: 120,
  });
  try {
    try {
      listenerHandles.push(await CapacitorUpdater.addListener("download", (event: unknown) => {
        const percent = Number((event as { percent?: unknown } | null)?.percent);
        if (Number.isFinite(percent)) onProgress?.(Math.max(0, Math.min(100, percent)));
        console.debug("[CapacitorUpdater] Native download progress", {
          version: release.bundleVersion,
          percent: Number.isFinite(percent) ? percent : undefined,
          event,
        });
      }));
      listenerHandles.push(await CapacitorUpdater.addListener("downloadFailed", (event: unknown) => {
        console.error("[CapacitorUpdater] Native downloadFailed event", event);
      }));
      listenerHandles.push(await CapacitorUpdater.addListener("downloadComplete", (event: unknown) => {
        console.info("[CapacitorUpdater] Native downloadComplete event", event);
      }));
    } catch (listenerError) {
      // Listener registration is diagnostic only; still attempt the actual download.
      console.warn("[CapacitorUpdater] Could not attach all download diagnostics", listenerError);
    }
    bundle = await CapacitorUpdater.download({
      url: downloadUrl,
      version: release.bundleVersion,
      checksum: release.otaChecksum,
    });
    const bundleDetails = bundle as typeof bundle & { version?: string; status?: string };
    console.info("[CapacitorUpdater] Native download() resolved", {
      id: bundle.id,
      version: bundleDetails.version,
      status: bundleDetails.status,
    });
    onProgress?.(100);
  } catch (error) {
    console.error("[OTA Download Error] CapacitorUpdater.download() rejected:", error, {
      platform: Capacitor.getPlatform(),
      version: release.bundleVersion,
      url: safeBundleUrl,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    });
    let nativeMessage: string;
    if (error instanceof Error && error.message) nativeMessage = error.message;
    else if (typeof error === "string" && error.trim()) nativeMessage = error;
    else {
      try { nativeMessage = JSON.stringify(error) || String(error); }
      catch { nativeMessage = String(error); }
    }
    throw new Error(`OTA Download Failed: ${nativeMessage || "Unknown native updater error"}`);
  } finally {
    await Promise.all(listenerHandles.map(async (handle) => {
      try { await handle.remove(); }
      catch (error) { console.debug("[CapacitorUpdater] Listener cleanup failed", error); }
    }));
  }
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

function UpdateAction({ release, installed, busy, onError, onBusy, onComplete, onProgress }: {
  release: Release;
  installed: Installed;
  busy: boolean;
  onError: (message: string) => void;
  onBusy: (value: boolean) => void;
  onComplete?: (message: string) => void;
  onProgress?: (percent: number | null) => void;
}) {
  const apkRequired = apkUpdateRequired(release, installed);
  const otaAvailable = hasOtaUpdate(release, installed);
  if (!apkRequired && !otaAvailable) return null;
  const apply = async () => {
    onBusy(true); onError(""); onComplete?.(""); onProgress?.(null);
    try {
      if (apkRequired) {
        let startupTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            installAndroidRelease(release, installed.code, { onError, onComplete, onProgress }),
            new Promise<never>((_, reject) => {
              startupTimer = setTimeout(() => reject(new Error("The Android installer did not respond. Please try again.")), 25_000);
            }),
          ]);
        } finally {
          if (startupTimer) clearTimeout(startupTimer);
        }
      }
      else {
        const appliedImmediately = await syncAndApplyOta(release, onProgress);
        if (!appliedImmediately) onComplete?.("Bundle downloaded. It will apply the next time BonList reloads.");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not apply this update.");
    } finally { onBusy(false); onProgress?.(null); }
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
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const checkForUpdates = useCallback(async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const [current, available] = await Promise.all([getInstalledVersion(), fetchAndroidRelease()]);
      setInstalled(current); setRelease(available);
      if (isAndroidApk() && current.code < 1) setError("Could not verify the installed APK version. Restart BonList and check again.");
      else if (isAndroidApk() && available.targetPlatform === "web-only" && !apkUpdateRequired(available, current)) setMessage("This web-only release does not apply to the Android APK.");
      else if (!apkUpdateRequired(available, current) && !hasOtaUpdate(available, current)) setMessage("You have the latest app and web bundle.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check for updates.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void checkForUpdates(); }, [checkForUpdates]);
  const [actionError, setActionError] = useState("");
  const showActionError = (value: string) => { setActionError(value); setError(value); if (value) setMessage(""); };

  return (
    <main className="mx-auto w-full max-w-3xl min-w-0 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-8">
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
          <p className="text-base text-foreground md:text-sm"><span className="font-semibold">Latest APK:</span> {release?.apkAvailable ? `v${release.latestVersion} (build ${release.versionCode})` : "Unavailable"}</p>
          <p className="text-base text-foreground md:text-sm"><span className="font-semibold">Latest web bundle:</span> {release?.bundleVersion || "Not checked"}</p>
        </div>
        {release && <div className="mt-5"><h2 className="font-semibold text-foreground">Release notes</h2><p className="mt-1 whitespace-pre-line text-base text-muted-foreground md:text-sm">{release.releaseNotes}</p><p className="mt-2 text-xs text-muted-foreground">Target: {release.targetPlatform}{release.requiresNewAPK ? " · Native APK update required for older builds" : " · OTA compatible"}</p></div>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={17} />{message}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void checkForUpdates()} disabled={loading} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "Checking…" : "Check for Updates"}
          </button>
          {release ? <UpdateAction release={release} installed={installed} busy={busy} onBusy={setBusy} onError={showActionError} onComplete={setMessage} onProgress={setDownloadProgress} /> : null}
        </div>
        {downloadProgress !== null && <p className="mt-3 text-xs text-muted-foreground" role="status">Downloading update: {Math.round(downloadProgress)}%</p>}
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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isAndroidApk()) return;
    let active = true;
    void Promise.all([getInstalledVersion(), fetchAndroidRelease()]).then(([current, available]) => {
      const applicable = apkUpdateRequired(available, current) || hasOtaUpdate(available, current);
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
        {message && <p className="mt-3 text-sm text-emerald-700" role="status">{message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={close} className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm font-semibold">Later</button>
          <UpdateAction release={release} installed={installed} busy={busy} onBusy={setBusy} onError={(value) => { setMessage(""); setError(value); }} onComplete={setMessage} />
        </div>
      </section>
    </div>
  );
}
