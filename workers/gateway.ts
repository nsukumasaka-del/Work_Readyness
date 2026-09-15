/**
 * Cloudflare Worker gateway for BonList.
 * - Proxies /api/* to the Express API (API_UPSTREAM_URL)
 * - Serves the Vite SPA from static assets for everything else
 *
 * Without API_UPSTREAM_URL, /api requests return a clear JSON error instead of HTTP 405.
 */
export interface Env {
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
      const upstream = String(env.API_UPSTREAM_URL || "")
        .trim()
        .replace(/\/+$/, "");

      if (!upstream) {
        return jsonError(
          503,
          "BonList API is not connected yet. In Cloudflare → Worker → Settings → Variables, set API_UPSTREAM_URL to your API server URL (the Node server that serves /api).",
        );
      }

      return proxyApi(request, `${upstream}/`);
    }

    return env.ASSETS.fetch(request);
  },
};
