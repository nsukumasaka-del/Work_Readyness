import {
  DEFAULT_SOCIAL_IMAGE,
  SITE_ORIGIN,
  isKnownAppPath,
  seoForPath,
} from "../artifacts/careerbridge-sa/src/lib/seo-policy";


function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function replaceMeta(html: string, selector: string, attribute: "name" | "property", content: string): string {
  const escaped = escapeHtmlAttribute(content);
  const expression = new RegExp(`<meta\\s+[^>]*${attribute}=["']${selector}["'][^>]*>`, "i");
  const element = `<meta ${attribute}="${selector}" content="${escaped}" />`;
  return expression.test(html) ? html.replace(expression, element) : html.replace("</head>", `  ${element}\n  </head>`);
}

export function renderRouteHtml(source: string, pathname: string, verificationClient = ""): { html: string; status: number; noIndex: boolean; robots: string } {
  const state = seoForPath(pathname);
  const known = isKnownAppPath(pathname);
  const canonicalUrl = state.canonicalPath ? `${SITE_ORIGIN}${state.canonicalPath}` : "";
  let html = source.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttribute(state.title)}</title>`);
  html = replaceMeta(html, "description", "name", state.description);
  html = replaceMeta(html, "robots", "name", state.robots);
  html = replaceMeta(html, "og:title", "property", state.title);
  html = replaceMeta(html, "og:description", "property", state.description);
  html = replaceMeta(html, "og:type", "property", state.type || "website");
  html = replaceMeta(html, "og:image", "property", DEFAULT_SOCIAL_IMAGE);
  html = replaceMeta(html, "twitter:title", "name", state.title);
  html = replaceMeta(html, "twitter:description", "name", state.description);
  html = replaceMeta(html, "twitter:card", "name", "summary_large_image");
  if (state.robots === "index, follow" && /^ca-pub-\d{10,20}$/.test(verificationClient)) {
    html = replaceMeta(html, "google-adsense-account", "name", verificationClient);
  }
  html = html.replace(/\s*<link\s+[^>]*rel=["']canonical["'][^>]*>/i, "");
  html = html.replace(/\s*<meta\s+[^>]*property=["']og:url["'][^>]*>/i, "");
  if (canonicalUrl) {
    html = html.replace("</head>", `  <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />\n  <meta property="og:url" content="${escapeHtmlAttribute(canonicalUrl)}" />\n  </head>`);
  }
  html = html.replace(/\s*<script\s+id=["']bonlist-route-structured-data["'][\s\S]*?<\/script>/i, "");
  if (state.structuredData?.length) {
    const json = JSON.stringify(state.structuredData.length === 1 ? state.structuredData[0] : state.structuredData).replace(/</g, "\\u003c");
    html = html.replace("</head>", `  <script id="bonlist-route-structured-data" type="application/ld+json">${json}</script>\n  </head>`);
  }
  const fallback = state.robots === "index, follow" ? state.fallbackHtml || "" : "";
  html = html.replace(/<div\s+id=["']root["']>[^<]*<\/div>/i, `<div id="root">${fallback}</div>`);
  return { html, status: known ? 200 : 404, noIndex: state.robots.startsWith("noindex"), robots: state.robots };
}
