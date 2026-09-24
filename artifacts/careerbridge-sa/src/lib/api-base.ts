import { Capacitor } from "@capacitor/core";

/**
 * Resolve API origin for browser + Capacitor Android.
 * Relative `/api/...` works on the live site / Vite proxy.
 * Bundled Capacitor apps need an absolute API base (LIVE_APP_URL / VITE_API_BASE_URL).
 */

declare global {
  interface Window {
    __BONLIST_API_BASE__?: string;
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isCapacitorLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "capacitor:" ||
      url.protocol === "ionic:" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

export function getApiBase(): string {
  let isNative = false;
  try { isNative = Capacitor.isNativePlatform(); } catch { /* browser builds */ }

  // A native WebView must never resolve API calls against capacitor://localhost.
  // Allow an explicitly configured HTTPS API origin, otherwise use production.
  if (isNative) {
    const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
    if (/^https:\/\//i.test(configured)) return stripTrailingSlash(configured);
    return "https://www.bonlist.site";
  }

  if (typeof window !== "undefined") {
    const runtime = window.__BONLIST_API_BASE__?.trim();
    if (runtime) return stripTrailingSlash(runtime);
  }

  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  return "";
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  if (!base) return normalized;
  return `${base}${normalized}`;
}

/**
 * Rewrite relative `/api` fetches to the configured API origin.
 * Covers App.tsx, CV builder, admin, and generated clients that use fetch.
 */
export function installApiFetchRewrite(): void {
  if (typeof window === "undefined") return;
  const base = getApiBase();
  if (!base) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      return originalFetch(apiUrl(input), init);
    }
    if (input instanceof URL && input.pathname.startsWith("/api")) {
      const asPath = `${input.pathname}${input.search}`;
      if (!input.host || isCapacitorLocalOrigin(input.origin)) {
        return originalFetch(apiUrl(asPath), init);
      }
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        const url = new URL(input.url, window.location.origin);
        if (
          url.pathname.startsWith("/api") &&
          (url.origin === window.location.origin || isCapacitorLocalOrigin(url.origin))
        ) {
          return originalFetch(
            new Request(apiUrl(`${url.pathname}${url.search}`), input),
            init,
          );
        }
      } catch {
        // fall through
      }
    }
    return originalFetch(input, init);
  };
}

export function describeApiMisconfiguration(): string | null {
  if (typeof window === "undefined") return null;
  if (getApiBase()) return null;
  if (!isCapacitorLocalOrigin(window.location.origin)) return null;
  return (
    "This Android build cannot reach the BonList API. " +
    "Set LIVE_APP_URL in the repo .env to your deployed BonList site, then rebuild with pnpm mobile:sync."
  );
}
