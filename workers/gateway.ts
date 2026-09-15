/**
 * Cloudflare Worker gateway for BonList.
 * - Handles /api/auth/* (and BonList career auth aliases) on Cloudflare D1
 * - Proxies other /api/* to the Express API (API_UPSTREAM_URL) when configured
 * - Serves the Vite SPA from static assets for everything else
 */
import { handleD1Auth, type D1Env } from "./d1/auth";

export interface Env extends D1Env {
  ASSETS: Fetcher;
  API_UPSTREAM_URL?: string;
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

async function proxyApi(request: Request, upstreamBase: string): Promise<Response> {
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
    // Required when streaming a request body in the Workers runtime.
    (init as RequestInit & { duplex?: string }).duplex = "half";
  }

  try {
    return await fetch(target.toString(), init);
  } catch {
    return jsonError(502, "Could not reach the BonList API. Please try again in a moment.");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      // Durable auth on D1 — never depends on Render / PGlite.
      if (env.DB) {
        const authResponse = await handleD1Auth(request, env);
        if (authResponse) return authResponse;
      }

      const upstream = String(env.API_UPSTREAM_URL || "")
        .trim()
        .replace(/\/+$/, "");

      if (!upstream) {
        return jsonError(
          503,
          "This BonList API route needs the Node API. In Cloudflare → Worker → Settings → Variables, set API_UPSTREAM_URL to your Render API URL (e.g. https://bonlist-api-….onrender.com).",
        );
      }

      return proxyApi(request, `${upstream}/`);
    }

    return env.ASSETS.fetch(request);
  },
};
