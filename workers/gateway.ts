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

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (env.DB) {
        const authResponse = await handleD1Auth(request, env);
        if (authResponse) return authResponse;
        const careerResponse = await handleD1Career(request, env);
        if (careerResponse) return careerResponse;
        const cvToolsResponse = await handleCvTools(request, env);
        if (cvToolsResponse) return cvToolsResponse;
        const platformResponse = await handlePlatformTools(request, env);
        if (platformResponse) return platformResponse;
      }

      const upstream = String(env.API_UPSTREAM_URL || "")
        .trim()
        .replace(/\/+$/, "");

      if (!upstream) {
        return jsonError(
          501,
          "This API route is not yet available on the Cloudflare edge. Auth routes (/api/auth/*) are live; career APIs are being migrated.",
        );
      }

      return proxyApi(request, `${upstream}/`);
    }

    return env.ASSETS.fetch(request);
  },
};
