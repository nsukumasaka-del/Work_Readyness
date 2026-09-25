/**
 * Cloudflare Worker gateway for BonList (edge-native).
 * - Auth (/api/auth/*, career auth aliases) → Cloudflare D1 + Resend
 * - Other /api/* → optional legacy upstream only if API_UPSTREAM_URL is set
 * - Everything else → static SPA assets
 */
import { handleD1Auth, type D1Env } from "./d1/auth";
import { handleD1Career } from "./d1/career";
import { handleCvTools } from "./d1/cv-tools";
import { handlePlatformTools } from "./d1/platform-tools";

export interface Env extends D1Env {
  ASSETS: Fetcher;
  ANDROID_LATEST_VERSION?: string;
  ANDROID_VERSION_CODE?: string;
  ANDROID_APK_URL?: string;
  ANDROID_RELEASE_NOTES?: string;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const NATIVE_WEBVIEW_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

function isNativeWebviewOrigin(origin: string): boolean {
  if (NATIVE_WEBVIEW_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch { return false; }
}

function withNativeCors(request: Request, response: Response): Response {
  const origin = request.headers.get("Origin") || "";
  if (!isNativeWebviewOrigin(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", request.headers.get("Access-Control-Request-Headers") || "Authorization, Content-Type, Accept, X-Requested-With");
  headers.append("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function serveOtaAsset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const isBundle = url.pathname === "/ota/latest.zip";
  const isManifest = url.pathname === "/ota/manifest.json";
  if (!isBundle && !isManifest) return jsonError(404, "OTA asset not found.");

  const corsHeaders = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type, Range",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    corsHeaders.set("Allow", "GET, HEAD, OPTIONS");
    return new Response("Method not allowed.", { status: 405, headers: corsHeaders });
  }

  // Fetch GET even for HEAD so we can reject SPA fallback HTML and verify the
  // archive signature before the native updater attempts to install it.
  const assetRequest = new Request(url, { method: "GET", headers: request.headers });
  const asset = await env.ASSETS.fetch(assetRequest);
  if (!asset.ok) {
    return new Response("OTA asset unavailable.", { status: asset.status, headers: corsHeaders });
  }

  const body = await asset.arrayBuffer();
  const bytes = new Uint8Array(body);
  if (isBundle && !(bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]!) && [0x04, 0x06, 0x08].includes(bytes[3]!))) {
    return new Response("OTA bundle is missing or invalid.", { status: 404, headers: corsHeaders });
  }

  const headers = new Headers(asset.headers);
  corsHeaders.forEach((value, key) => headers.set(key, value));
  headers.set("Content-Type", isBundle ? "application/zip" : "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  if (isBundle) {
    headers.set("Content-Disposition", 'attachment; filename="bonlist-ota-latest.zip"');
    headers.set("Content-Length", String(bytes.byteLength));
  }
  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
}

async function proxyApi(
  request: Request,
  upstreamBase: string,
): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, upstreamBase);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    (init as RequestInit & { duplex?: string }).duplex = "half";
  }

  try {
    return await fetch(target.toString(), init);
  } catch {
    return jsonError(
      502,
      "Could not reach the BonList API. Please try again in a moment.",
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ota/latest.zip" || url.pathname === "/ota/manifest.json") {
      return serveOtaAsset(request, env);
    }

    if (url.pathname === "/api/app/version" && request.method === "GET") {
      const latestVersion = String(env.ANDROID_LATEST_VERSION || "1.0.0").trim();
      const parsedVersionCode = Number(env.ANDROID_VERSION_CODE || 1);
      const configuredApkUrl = String(env.ANDROID_APK_URL || "https://www.bonlist.site/downloads/BonList.apk").trim();
      let bundleManifest: Record<string, unknown> = {};
      try {
        const manifestUrl = new URL("/ota/manifest.json", url.origin);
        const manifestResponse = await env.ASSETS.fetch(new Request(manifestUrl, { headers: { "cache-control": "no-cache" } }));
        if (manifestResponse.ok) bundleManifest = await manifestResponse.json() as Record<string, unknown>;
      } catch (error) {
        console.warn("[app-version] OTA manifest unavailable; returning APK metadata only", error);
      }
      return withNativeCors(request, new Response(JSON.stringify({
        latestVersion,
        versionCode: Number.isFinite(parsedVersionCode) && parsedVersionCode > 0 ? parsedVersionCode : 1,
        apkUrl: configuredApkUrl,
        bundleVersion: String(bundleManifest.bundleVersion || ""),
        bundleUrl: String(bundleManifest.bundleUrl || ""),
        targetPlatform: String(bundleManifest.targetPlatform || "all"),
        requiresNewAPK: Boolean(bundleManifest.requiresNewAPK),
        releaseNotes: String(bundleManifest.releaseNotes || env.ANDROID_RELEASE_NOTES || "Current stable BonList Android release."),
      }), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      }));
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return withNativeCors(request, new Response(null, { status: 204 }));
      }
      if (env.DB) {
        try {
          const authResponse = await handleD1Auth(request, env);
          if (authResponse) return withNativeCors(request, authResponse);
        } catch (err) {
          console.error("[auth] D1 auth handler failed:", err);
          return withNativeCors(request, jsonError(
            500,
            "Authentication is temporarily unavailable. Please try again.",
          ));
        }
        const careerResponse = await handleD1Career(request, env);
        if (careerResponse) return withNativeCors(request, careerResponse);
        const cvToolsResponse = await handleCvTools(request, env);
        if (cvToolsResponse) return withNativeCors(request, cvToolsResponse);
        const platformResponse = await handlePlatformTools(request, env);
        if (platformResponse) return withNativeCors(request, platformResponse);
      }

      const upstream = String(env.API_UPSTREAM_URL || "")
        .trim()
        .replace(/\/+$/, "");

      if (!upstream) {
        return withNativeCors(request, jsonError(
          501,
          "This API route is not yet available on the Cloudflare edge. Auth routes (/api/auth/*) are live; career APIs are being migrated.",
        ));
      }

      return withNativeCors(request, await proxyApi(request, `${upstream}/`));
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    const isHtmlOrScript =
      request.url.includes(".html") ||
      request.url.includes(".js") ||
      request.url.includes(".css") ||
      request.url.includes(".mjs");

    if (isHtmlOrScript) {
      headers.set("Cache-Control", "no-store, max-age=0");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
    }

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};
