/**
 * Cloudflare Worker gateway for BonList (edge-native).
 * - Auth (/api/auth/*, career auth aliases) → Cloudflare D1 + Resend
 * - Career, auth, and platform /api/* → Cloudflare-native handlers
 * - Everything else → static SPA assets
 */
import { handleD1Auth, type D1Env } from "./d1/auth";
import { handleD1Career } from "./d1/career";
import { handleCvTools } from "./d1/cv-tools";
import { getAuthenticatedUser } from "./d1/auth";
import { handlePlatformTools } from "./d1/platform-tools";
import { handleCvAdmin } from "./cv-admin";
import { handleD1Yoco } from './d1/yoco';
import { canUseTemplate, chargeFeatureCredits, getFeatureQuote, handleMonetization } from "./d1/monetization";
import puppeteer from "@cloudflare/puppeteer";
import {
  generateCvAssistantJson,
  generateGeminiJson,
  generateSmokeyReply,
  streamSmokeyReply,
  type CvAssistantTask,
  type GeminiChatTurn,
} from "../artifacts/api-server/src/lib/ai/gemini-client";
import { renderRouteHtml } from "./public-html";

export interface Env extends D1Env {
  ASSETS: Fetcher;
  BROWSER: unknown;
  ANDROID_LATEST_VERSION?: string;
  ANDROID_VERSION_CODE?: string;
  ANDROID_APK_URL?: string;
  ANDROID_RELEASE_NOTES?: string;
  ADSENSE_SITE_VERIFICATION_CLIENT?: string;
}

async function handleCvPdfExport(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonError(405, "Method not allowed.");
  if (!env.BROWSER) return jsonError(503, "PDF export is temporarily unavailable.");
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonError(401, "Please sign in to export your CV.");

  // Each printable A4 frame carries a full clipped copy of the editor DOM.
  // Keep a bounded limit while allowing multi-page CVs to reach Chromium.
  const maxExportHtmlBytes = 16_000_000;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxExportHtmlBytes) return jsonError(413, "CV document is too large to export.");
  let payload: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return jsonError(400, "A valid CV document is required.");
  }
  const html = typeof payload.html === "string" ? payload.html : "";
  const templateId = typeof payload.templateId === "string" ? payload.templateId.trim().slice(0, 80) : "serif_classic";
  if (!await canUseTemplate(env, user, templateId)) {
    return jsonError(402, "Unlock this template once to export and reuse it for life.");
  }
  if (!html || new TextEncoder().encode(html).length > maxExportHtmlBytes || !html.includes("bonlist-cv-document")) {
    return jsonError(400, "The rendered CV document is missing or too large.");
  }
  // The client only sends the rendered CV. Never execute scripts from an
  // uploaded document, and disable JavaScript in the rendering browser too.
  if (/<\s*script\b/i.test(html)) return jsonError(400, "CV export content is invalid.");
  const filename = (typeof payload.filename === "string" ? payload.filename : "BonList-CV.pdf")
    .replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "BonList-CV.pdf";

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch(env.BROWSER as never);
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      if (Array.from(document.fonts).some(font => font.status === "error")) throw new Error("A CV font failed to load.");
      await Promise.all(Array.from(document.images).map(async image => {
        await image.decode();
      }));
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      scale: 1,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[cv-pdf-export] Chromium PDF generation failed:", error);
    return jsonError(502, "Could not generate the CV PDF. Please try again.");
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

const SMOKEY_SUGGESTIONS = [
  "How can I improve my CV?",
  "Help me prepare for an interview.",
  "Which roles match my experience?",
];

function text(value: unknown, maxLength = 1_200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function textList(value: unknown, maxCount = 12): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim().slice(0, 160))
        .slice(0, maxCount)
    : [];
}

async function handleSmokeyChat(request: Request, env: Env): Promise<Response> {
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    input = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return jsonError(400, "Send a valid JSON chat message.");
  }

  const message = text(input.message, 2_000);
  if (!message) return jsonError(400, "Enter a message for Smokey.");
  const apiKey = String(env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return jsonError(503, "Smokey is temporarily unavailable. Please try again later.");

  const history: GeminiChatTurn[] = Array.isArray(input.history)
    ? input.history.flatMap((turn): GeminiChatTurn[] => {
        if (!turn || typeof turn !== "object") return [];
        const item = turn as Record<string, unknown>;
        const role = item.role === "model" || item.role === "assistant" || item.role === "smokey"
          ? "model"
          : item.role === "user" ? "user" : null;
        const turnText = text(item.text, 2_000);
        return role && turnText ? [{ role, parts: [{ text: turnText }] }] : [];
      })
    : [];

  const role = text(input.role, 120);
  const cv = input.cvDocument && typeof input.cvDocument === "object"
    ? input.cvDocument as Record<string, unknown>
    : {};
  const content = cv.content && typeof cv.content === "object"
    ? cv.content as Record<string, unknown>
    : cv;
  const experiences = Array.isArray(content.experiences)
    ? content.experiences
    : Array.isArray(content.workExperience) ? content.workExperience : [];
  const context = JSON.stringify({
    targetRole: role,
    summary: text(content.summary || content.professionalSummary),
    skills: textList(content.skills),
    systems: textList(content.toolsAndSoftware),
    experience: experiences.slice(0, 5).flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      return [{
        role: text(item.role || item.jobTitle, 120),
        company: text(item.company, 120),
        highlights: textList(item.bullets || item.responsibilities, 4),
      }];
    }),
  });
  const chatInput = {
    apiKey,
    model: env.GEMINI_MODEL || undefined,
    message,
    history,
    context,
  };

  if (input.stream === false) {
    try {
      const reply = await generateSmokeyReply(chatInput);
      if (!reply.trim()) return jsonError(502, "Smokey could not prepare a response. Please try again.");
      return new Response(JSON.stringify({ success: true, reply, suggestions: SMOKEY_SUGGESTIONS }), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    } catch (error) {
      console.error("[smokey] Gemini chat failed", error);
      return jsonError(502, "Smokey is currently taking a quick breather. Please try again in a moment.");
    }
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      controller.enqueue(encoder.encode(": connected\n\n"));
      try {
        for await (const chunk of streamSmokeyReply(chatInput)) send({ text: chunk });
        send({ done: true });
      } catch (error) {
        console.error("[smokey] Gemini stream failed", error);
        send({ error: "Smokey lost the connection. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

async function handleCvAssistant(request: Request, env: Env, task: CvAssistantTask): Promise<Response> {
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    input = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return jsonError(400, "Send a valid JSON CV request.");
  }
  const premiumFeatureId = task === "improve" ? "improve_cv" : task === "tailor" ? "tailor_cv" : null;
  const user = premiumFeatureId ? await getAuthenticatedUser(request, env) : null;
  const idempotencyKey = text(input.idempotencyKey, 160);
  if (premiumFeatureId) {
    if (!user) return jsonError(401, "Please sign in to use this premium career tool.");
    if (input.creditConsent !== true || !idempotencyKey) return jsonError(400, "Confirm the displayed BonList Credit cost before continuing.");
    const quote = await getFeatureQuote(env, user, premiumFeatureId);
    if (!quote) return jsonError(503, "Premium feature pricing is temporarily unavailable.");
    if (!quote.allowed) return jsonError(402, `This action requires ${quote.feature.credit_cost} BonList Credits. Your balance is ${quote.balance}.`);
  }
  const apiKey = String(env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return jsonError(503, "CV AI tools are temporarily unavailable.");

  const cv = input.cvDocument && typeof input.cvDocument === "object" ? input.cvDocument : {};
  const evidence: Record<string, unknown> = {
    cvDocument: cv,
    targetRole: text(input.targetRole || input.role || (cv as Record<string, unknown>).headline, 160),
    jobDescription: text(input.jobDescription || input.targetJob, 8_000),
    question: text(input.question, 2_000),
    text: text(input.text, 5_000),
    bullet: text(input.bullet, 1_000),
    tone: text(input.tone, 40),
    scope: text(input.scope, 40),
    existingSkills: textList(input.existingSkills || (cv as Record<string, unknown>).skills, 40),
    baseline: input.baseline,
  };
  if (JSON.stringify(evidence).length > 32_000) return jsonError(413, "This CV is too large to process. Please shorten it and retry.");
  if ((task === "bullet" && !evidence.bullet) || (task === "humanize" && !evidence.text) ||
      (task === "advisor" && !evidence.question) || (task === "summary" && !evidence.cvDocument) ||
      (task === "skills" && !evidence.cvDocument) || (task === "tailor" && !evidence.jobDescription)) {
    return jsonError(400, "Required CV assistant details are missing.");
  }
  try {
    const result = await generateCvAssistantJson<Record<string, unknown>>({
      apiKey,
      model: env.GEMINI_MODEL,
      task,
      evidence,
    });
    if (task === "summary" && typeof result.summary !== "string") throw new Error("Gemini summary response was invalid.");
    if (task === "skills" && !Array.isArray(result.skills)) throw new Error("Gemini skills response was invalid.");
    if (task === "bullet" && typeof result.improved !== "string") throw new Error("Gemini bullet response was invalid.");
    if (task === "humanize" && typeof result.humanized !== "string") throw new Error("Gemini summary rewrite was invalid.");
    if (task === "advisor" && typeof result.answer !== "string") throw new Error("Gemini advisor response was invalid.");
    if ((task === "improve" || task === "tailor") && !Array.isArray(result.proposals)) throw new Error("Gemini returned an invalid proposal list.");
    if (task === "tailor" && typeof result.overallMatch !== "number") throw new Error("Gemini returned an invalid match score.");
    let creditResult: Record<string, unknown> | undefined;
    if (premiumFeatureId && user) {
      const charge = await chargeFeatureCredits(env, user, premiumFeatureId, idempotencyKey);
      if (!charge.ok) return jsonError(charge.status, charge.error);
      creditResult = { charged: charge.charged, balance: charge.balance, adminBypass: "adminBypass" in charge ? charge.adminBypass : false };
    }
    return new Response(JSON.stringify({ ...result, creditTransaction: creditResult }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error(`[cv-ai:${task}] Gemini request failed`, error);
    return jsonError(502, "CV AI could not complete this request. Please try again.");
  }
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
  if (origin === "https://www.bonlist.site" || origin === "https://bonlist.site") return true;
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

  const corsHeaders = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type, Range",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  if (request.method === "OPTIONS") {
    corsHeaders.set("Content-Type", isManifest ? "application/json; charset=utf-8" : "application/zip");
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!isBundle && !isManifest) {
    corsHeaders.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ error: "OTA asset not found." }), { status: 404, headers: corsHeaders });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    corsHeaders.set("Allow", "GET, HEAD, OPTIONS");
    corsHeaders.set("Content-Type", "application/json; charset=utf-8");
    return new Response("Method not allowed.", { status: 405, headers: corsHeaders });
  }

  // Workers Assets does not consistently expose Content-Length for HEAD.
  // Read the GET asset so both GET and HEAD validate the same archive bytes.
  const assetRequest = new Request(url, { method: "GET", headers: request.headers });
  const asset = await env.ASSETS.fetch(assetRequest);
  if (!asset.ok) {
    corsHeaders.set("Content-Type", isBundle ? "application/zip" : "application/json; charset=utf-8");
    return new Response("OTA asset unavailable.", { status: asset.status, headers: corsHeaders });
  }

  const body = await asset.arrayBuffer();
  const bytes = new Uint8Array(body);
  if (isBundle && !(bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]!) && [0x04, 0x06, 0x08].includes(bytes[3]!))) {
    corsHeaders.set("Content-Type", "application/zip");
    return new Response("OTA bundle is missing or invalid.", { status: 404, headers: corsHeaders });
  }

  const headers = new Headers(asset.headers);
  corsHeaders.forEach((value, key) => headers.set(key, value));
  headers.set("Content-Type", isBundle ? "application/zip" : "application/json; charset=utf-8");
  if (isBundle) {
    headers.set("Content-Disposition", 'attachment; filename="latest.zip"');
    headers.set("Content-Length", String(bytes.byteLength));
  }
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(body, { status: 200, headers });
}

async function serveApkAsset(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  }
  const url = new URL(request.url);
  const assetHeaders = new Headers(request.headers);
  assetHeaders.delete("If-None-Match");
  assetHeaders.delete("If-Modified-Since");
  assetHeaders.set("Cache-Control", "no-cache");
  const asset = await env.ASSETS.fetch(new Request(url, { method: request.method, headers: assetHeaders }));
  if (!asset.ok || (asset.headers.get("Content-Type") || "").toLowerCase().includes("text/html")) {
    return new Response("APK unavailable.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const headers = new Headers(asset.headers);
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("Content-Disposition", 'attachment; filename="BonList.apk"');
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Surrogate-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(request.method === "HEAD" ? null : asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

type ApkReleaseManifest = {
  applicationId: string;
  latestVersion: string;
  versionCode: number;
  fileSizeBytes: number;
  checksumSha256: string;
};

async function readApkReleaseManifest(env: Env, origin: string): Promise<ApkReleaseManifest | null> {
  try {
    const manifestResponse = await env.ASSETS.fetch(new Request(new URL("/downloads/apk-manifest.json", origin), {
      headers: { "Cache-Control": "no-cache" },
    }));
    if (!manifestResponse.ok) return null;
    const manifest = await manifestResponse.json() as Partial<ApkReleaseManifest>;
    if (manifest.applicationId !== "com.bonlist.careerbridge" ||
        !manifest.latestVersion ||
        !Number.isSafeInteger(manifest.versionCode) || Number(manifest.versionCode) < 1 ||
        !Number.isSafeInteger(manifest.fileSizeBytes) || Number(manifest.fileSizeBytes) < 1024 ||
        !/^[a-f0-9]{64}$/i.test(String(manifest.checksumSha256 || ""))) return null;
    const apkResponse = await env.ASSETS.fetch(new Request(new URL("/downloads/BonList.apk", origin), {
      method: "HEAD", headers: { "Cache-Control": "no-cache" },
    }));
    if (!apkResponse.ok || (apkResponse.headers.get("Content-Type") || "").toLowerCase().includes("text/html")) return null;
    const length = Number(apkResponse.headers.get("Content-Length"));
    if (Number.isFinite(length) && length > 0 && length !== manifest.fileSizeBytes) return null;
    return manifest as ApkReleaseManifest;
  } catch (error) {
    console.warn("[app-version] APK release manifest unavailable", error);
    return null;
  }
}

async function hasValidOtaBundle(env: Env, url: URL): Promise<boolean> {
  const response = await env.ASSETS.fetch(new Request(url, { method: "GET", headers: { "cache-control": "no-cache" } }));
  if (!response.ok || (response.headers.get("Content-Type") || "").toLowerCase().includes("text/html") || !response.body) return false;
  const reader = response.body.getReader();
  const signature = new Uint8Array(4);
  let offset = 0;
  try {
    while (offset < signature.length) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const amount = Math.min(chunk.value.length, signature.length - offset);
      signature.set(chunk.value.subarray(0, amount), offset);
      offset += amount;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return offset === 4 && signature[0] === 0x50 && signature[1] === 0x4b && [0x03, 0x05, 0x07].includes(signature[2]!) && [0x04, 0x06, 0x08].includes(signature[3]!);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if ((url.hostname === "bonlist.site" || url.hostname === "www.bonlist.site") && (url.protocol !== "https:" || url.hostname === "bonlist.site")) {
      url.protocol = "https:";
      url.hostname = "www.bonlist.site";
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname.startsWith("/ota/")) {
      return serveOtaAsset(request, env);
    }

    if (url.pathname === "/downloads/BonList.apk") {
      return serveApkAsset(request, env);
    }

    if (url.pathname === "/api/app/version" && request.method === "GET") {
      const apkRelease = await readApkReleaseManifest(env, url.origin);
      const apkUrl = apkRelease ? new URL("/downloads/BonList.apk", url.origin) : null;
      if (apkUrl && apkRelease) {
        apkUrl.searchParams.set("v", String(apkRelease.versionCode));
        apkUrl.searchParams.set("sha", apkRelease.checksumSha256.slice(0, 16));
      }
      let bundleManifest: Record<string, unknown> = {};
      let hasBundle = false;
      try {
        const manifestUrl = new URL("/ota/manifest.json", url.origin);
        const manifestResponse = await env.ASSETS.fetch(new Request(manifestUrl, { headers: { "cache-control": "no-cache" } }));
        const bundleUrl = new URL("/ota/latest.zip", url.origin);
        hasBundle = await hasValidOtaBundle(env, bundleUrl);
        if (manifestResponse.ok && hasBundle) {
          const candidate = await manifestResponse.json() as Record<string, unknown>;
          const otaChecksum = String(candidate.otaChecksum || "").toLowerCase();
          const bundleSizeBytes = Number(candidate.bundleSizeBytes || 0);
          if (/^[a-f0-9]{64}$/.test(otaChecksum) && Number.isSafeInteger(bundleSizeBytes) && bundleSizeBytes >= 1024) {
            bundleManifest = candidate;
          } else {
            hasBundle = false;
          }
        }
      } catch (error) {
        console.warn("[app-version] OTA manifest unavailable; returning APK metadata only", error);
      }
      return withNativeCors(request, new Response(JSON.stringify({
        latestVersion: apkRelease?.latestVersion || String(env.ANDROID_LATEST_VERSION || "").trim(),
        versionCode: apkRelease?.versionCode || 0,
        latestVersionCode: apkRelease?.versionCode || 0,
        apkUrl: apkUrl?.toString() || "",
        apkAvailable: Boolean(apkRelease),
        fileSizeBytes: apkRelease?.fileSizeBytes || 0,
        checksumSha256: apkRelease?.checksumSha256 || "",
        bundleVersion: hasBundle ? String(bundleManifest.bundleVersion || "") : "",
        bundleUrl: hasBundle ? String(bundleManifest.bundleUrl || "") : "",
        otaChecksum: hasBundle ? String(bundleManifest.otaChecksum || "") : "",
        bundleSizeBytes: hasBundle ? Number(bundleManifest.bundleSizeBytes || 0) : 0,
        targetPlatform: hasBundle ? String(bundleManifest.targetPlatform || "all") : apkRelease ? "native-apk-required" : "web-only",
        requiresNewAPK: hasBundle && Boolean(bundleManifest.requiresNewAPK),
        releaseNotes: String(bundleManifest.releaseNotes || env.ANDROID_RELEASE_NOTES || "Current stable BonList Android release."),
      }), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      }));
    }

    if (url.pathname === "/api/career/smokey/chat" && request.method === "POST") {
      return withNativeCors(request, await handleSmokeyChat(request, env));
    }

    if (url.pathname === "/api/career/cv/export-pdf") {
      return withNativeCors(request, await handleCvPdfExport(request, env));
    }

    if (request.method === "POST") {
      const cvAiTasks: Record<string, CvAssistantTask> = {
        "/api/career/cv/ai/summary": "summary",
        "/api/career/cv/ai/skills": "skills",
        "/api/career/cv/enhance-bullet": "bullet",
        "/api/career/cv/humanize": "humanize",
        "/api/career/cv/advisor": "advisor",
        "/api/career/cv/improve": "improve",
        "/api/career/cv/tailor": "tailor",
      };
      const task = cvAiTasks[url.pathname];
      if (task) return withNativeCors(request, await handleCvAssistant(request, env, task));
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
        const yocoResponse = await handleD1Yoco(request, env);
        if (yocoResponse) return withNativeCors(request, yocoResponse);
        const monetizationResponse = await handleMonetization(request, env);
        if (monetizationResponse) return withNativeCors(request, monetizationResponse);
        const adminResponse = await handleCvAdmin(request, env);
        if (adminResponse) return withNativeCors(request, adminResponse);
        const careerResponse = await handleD1Career(request, env);
        if (careerResponse) return withNativeCors(request, careerResponse);
        const cvToolsResponse = await handleCvTools(request, env);
        if (cvToolsResponse) return withNativeCors(request, cvToolsResponse);
        const platformResponse = await handlePlatformTools(request, env);
        if (platformResponse) return withNativeCors(request, platformResponse);
      }

      return withNativeCors(request, jsonError(
        501,
        "This API route is not yet available on Cloudflare Workers.",
      ));
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    const contentType = (assetResponse.headers.get("Content-Type") || "").toLowerCase();
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    if (contentType.includes("text/html")) {
      headers.delete("Content-Length");
      headers.delete("Content-Encoding");
      headers.delete("ETag");
      headers.set("Cache-Control", "no-store, max-age=0");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
      const rendered = renderRouteHtml(await assetResponse.text(), url.pathname, env.ADSENSE_SITE_VERIFICATION_CLIENT);
      if (rendered.noIndex) headers.set("X-Robots-Tag", `${rendered.robots}, noarchive`);
      else headers.delete("X-Robots-Tag");
      return new Response(request.method === "HEAD" ? null : rendered.html, {
        status: rendered.status,
        headers,
      });
    }

    if (url.pathname.startsWith("/assets/") && /-[a-z0-9_-]{8,}\.(?:m?js|css|woff2?|png|jpe?g|webp|svg)$/i.test(url.pathname)) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const isApi = path === "/api" || path.startsWith("/api/");
    // Preflight must run before method-specific handlers, including PDF export.
    if (isApi && request.method === "OPTIONS") {
      return withNativeCors(request, new Response(null, { status: 204 }));
    }
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (!isApi) throw error;
      console.error("[api] Request failed", request.method, path, error);
      return withNativeCors(request, Response.json({
        success: false,
        error: "Service temporarily unavailable. Please try again.",
        message: "Service temporarily unavailable. Please try again.",
        fallback: false,
      }, { status: 503, headers: { "Cache-Control": "no-store" } }));
    }
  },
};
