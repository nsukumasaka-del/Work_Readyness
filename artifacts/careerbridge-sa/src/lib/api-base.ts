import { Capacitor } from "@capacitor/core";

/**
 * Resolve API origin for browser + Capacitor Android.
 * Relative `/api/...` works on the live site / Vite proxy.
 * Bundled Capacitor apps use the production Cloudflare Worker origin. Web builds
 * use same-origin API routes, so no upstream API override is needed.
 */

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
  try {
    return Capacitor.isNativePlatform() ? "https://www.bonlist.site" : "";
  } catch {
    return "";
  }
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
  // Native builds always use the production Worker origin; web builds are same-origin.
  return null;
}
