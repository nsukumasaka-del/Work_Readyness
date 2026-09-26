/**
 * Cloudflare Worker gateway for BonList (edge-native).
 * - Auth (/api/auth/*, career auth aliases) → Cloudflare D1 + Resend
 * - Career, auth, and platform /api/* → Cloudflare-native handlers
 * - Everything else → static SPA assets
 */
import { handleD1Auth, type D1Env } from "./d1/auth";
import { handleD1Career } from "./d1/career";
import { handleCvTools } from "./d1/cv-tools";
import { handlePlatformTools } from "./d1/platform-tools";
import {
  generateCvAssistantJson,
  generateGeminiJson,
  generateSmokeyReply,
  streamSmokeyReply,
  type CvAssistantTask,
  type GeminiChatTurn,
} from "../artifacts/api-server/src/lib/ai/gemini-client";

export interface Env extends D1Env {
  ASSETS: Fetcher;
  ANDROID_LATEST_VERSION?: string;
  ANDROID_VERSION_CODE?: string;
  ANDROID_APK_URL?: string;
  ANDROID_RELEASE_NOTES?: string;
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
    return new Response(JSON.stringify(result), {
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

    if (url.pathname === "/api/career/smokey/chat" && request.method === "POST") {
      return withNativeCors(request, await handleSmokeyChat(request, env));
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
