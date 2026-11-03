import { getAuthenticatedUser, type D1Env } from "./d1/auth";
import { generateTemplateDesignFromImage } from "../artifacts/api-server/src/lib/ai/gemini-client";
import { parseTemplateDesign } from "../shared/template-design";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "cdn-cache-control": "no-store",
      "surrogate-control": "no-store",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

type CountRow = { count: number };
type TemplateRow = Record<string, unknown> & {
  id: string | number;
  name?: string;
  description?: string;
  category?: string;
  preview_url?: string | null;
  active?: number;
  created_at?: string;
  updated_at?: string;
  definition_json?: string | null;
  asset_key?: string | null;
};

type TemplateInput = {
  id: string;
  name: string;
  description: string;
  category: string;
  previewUrl: string | null;
  active: number;
  definitionJson?: string | null;
};

const DEFAULT_TEMPLATES: TemplateInput[] = [
  ["serif_classic", "Serif Classic", "Traditional", "Formal serif layout for academic and professional CVs."],
  ["corporate_blue", "Corporate Blue", "Modern", "Crisp corporate layout with blue accent headings."],
  ["editorial_gold", "Editorial Gold", "Executive", "Editorial layout for legal, advisory and senior roles."],
  ["analyst_clean", "Analyst Clean", "Modern", "Clean analytical layout for product, operations and technology."],
  ["double_column", "Double Column", "Modern", "Compact two-column layout balancing highlights and career history."],
  ["ivy_league", "Ivy League", "Traditional", "Distinguished academic and legal single-column layout."],
  ["elegant", "Elegant", "Traditional", "Refined typography for leadership and communications roles."],
  ["contemporary", "Contemporary", "Modern", "Fresh two-column layout with strong visual hierarchy."],
  ["modern", "Modern", "Modern", "Sleek dual-column layout for digital and technical careers."],
  ["timeline", "Timeline", "Creative", "Chronological milestone layout for career progression."],
  ["creative", "Creative", "Creative", "Portfolio-forward layout with high visual impact."],
  ["stylish", "Stylish", "Creative", "High-contrast layout for brand and creative leadership."],
  ["single_column", "Single Column", "ATS-Friendly", "Linear ATS-optimized layout for enterprise portals."],
  ["compact", "Compact", "Modern", "High-density layout designed for concise one-page CVs."],
  ["polished", "Polished", "Executive", "Formal executive layout with structured role hierarchy."],
  ["multicolumn", "Multicolumn", "Modern", "Modular multi-panel layout for hybrid specialists."],
  ["classic", "Classic", "Traditional", "Timeless reverse-chronological corporate format."],
  ["high_performer", "High Performer", "Executive", "Outcome-led format for quantified achievements."],
  ["minimal", "Minimal", "Minimalist", "Distraction-free layout with generous whitespace."],
].map(([id, name, category, description]) => ({ id, name, category, description, previewUrl: null, active: 1 }));

function templateInput(value: unknown): TemplateInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const id = String(body.id || "").trim();
  const name = String(body.name || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id) || !name || name.length > 120) return null;
  const description = String(body.description || "").trim().slice(0, 1000);
  const category = String(body.category || "CV").trim().slice(0, 80) || "CV";
  const rawPreview = body.previewUrl ?? body.preview_url;
  const previewUrl = rawPreview ? String(rawPreview).trim().slice(0, 1000) : null;
  const active = body.active === false || body.active === 0 || body.active === "0" ? 0 : 1;
  const rawDefinition = body.definitionJson ?? body.definition_json;
  let definitionJson: string | null | undefined;
  if (rawDefinition === null) definitionJson = null;
  else if (rawDefinition !== undefined) {
    const design = typeof rawDefinition === "string"
      ? (() => { try { return JSON.parse(rawDefinition) as unknown; } catch { return null; } })()
      : rawDefinition;
    const parsedDesign = parseTemplateDesign(design);
    if (!parsedDesign) return null;
    definitionJson = JSON.stringify(parsedDesign);
  }
  return { id, name, description, category, previewUrl, active, definitionJson };
}

async function insertTemplate(db: D1Database, input: TemplateInput) {
  return db.prepare(
    `INSERT INTO templates (id, name, description, category, preview_url, active, created_at, updated_at, deleted_at, definition_json, asset_key)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
       category=excluded.category, preview_url=COALESCE(excluded.preview_url, templates.preview_url), active=excluded.active,
       definition_json=COALESCE(excluded.definition_json, templates.definition_json),
       updated_at=datetime('now'), deleted_at=NULL`,
  ).bind(input.id, input.name, input.description, input.category, input.previewUrl, input.active, input.definitionJson ?? null).run();
}

async function ensureTemplatesTable(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'CV',
    preview_url TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    definition_json TEXT,
    asset_key TEXT
  )`).run();
  for (const [column, type] of [["deleted_at", "TEXT"], ["definition_json", "TEXT"], ["asset_key", "TEXT"]]) {
    try {
      await db.prepare(`ALTER TABLE templates ADD COLUMN ${column} ${type}`).run();
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column")) throw error;
    }
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_templates_created ON templates(created_at DESC)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS template_catalog_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    initialized_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  const initialized = await db.prepare("SELECT id FROM template_catalog_state WHERE id = 1").first();
  if (!initialized) {
    const seedStatements = DEFAULT_TEMPLATES.map((template) => db.prepare(
      `INSERT OR IGNORE INTO templates
       (id, name, description, category, preview_url, active, created_at, updated_at, deleted_at, definition_json, asset_key)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL, NULL, NULL)`,
    ).bind(template.id, template.name, template.description, template.category, template.previewUrl, template.active));
    seedStatements.push(db.prepare("INSERT OR IGNORE INTO template_catalog_state (id) VALUES (1)"));
    await db.batch(seedStatements);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function safeTemplateText(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function templateAssetMimeType(file: File): { mimeType: string; extension: string } | null {
  const imageTypes: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = imageTypes[file.type.toLowerCase()];
  return extension ? { mimeType: file.type.toLowerCase(), extension } : null;
}

function templateAssetKey(value: unknown): string | null {
  if (typeof value !== "string" || !/^templates\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(value)) return null;
  return value;
}

function rangeStart(url: URL): string | null {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) return from;
  switch (url.searchParams.get("range")) {
    case "today": return new Date().toISOString().slice(0, 10);
    case "7d": return new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    case "30d": return new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    case "90d": return new Date(Date.now() - 89 * 86_400_000).toISOString().slice(0, 10);
    default: return null;
  }
}

async function countRows(db: D1Database, table: string, start: string | null): Promise<number> {
  const statement = start
    ? db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE created_at >= ?`).bind(`${start} 00:00:00`)
    : db.prepare(`SELECT COUNT(*) AS count FROM ${table}`);
  const row = await statement.first<CountRow>();
  return Number(row?.count || 0);
}

async function safeFirst<T>(statement: D1PreparedStatement, fallback: T): Promise<T> {
  try { return (await statement.first<T>()) ?? fallback; } catch { return fallback; }
}

async function safeAll<T>(statement: D1PreparedStatement): Promise<T[]> {
  try { return (await statement.all<T>()).results || []; } catch { return []; }
}

function dateClause(start: string | null, column = "created_at") {
  return start ? ` WHERE ${column} >= '${start.replace(/'/g, "") } 00:00:00'` : "";
}

function safeAggregatePath(value: string) {
  return String(value || "/").split(/[?#]/, 1)[0].slice(0, 240) || "/";
}

function safeReferrerOrigin(value: string | null) {
  if (!value || value === "direct") return value;
  try { return new URL(value).origin.slice(0, 200); } catch { return null; }
}

async function buildOverview(db: D1Database, url: URL) {
  await ensureTemplatesTable(db);
  const start = rangeStart(url);
  const where = dateClause(start);
  const [users, usersTotal, activeUsers, templates, traffic, jobs, payments, legacyPayments, visitsByDay, topPaths, topReferrers] = await Promise.all([
    countRows(db, "users", start),
    countRows(db, "users", null),
    safeFirst(db.prepare("SELECT COUNT(DISTINCT user_id) AS count FROM sessions WHERE expires_at > datetime('now')"), { count: 0 }),
    safeFirst(db.prepare("SELECT COUNT(*) AS count FROM templates WHERE deleted_at IS NULL AND active = 1"), { count: 0 }),
    safeFirst(db.prepare(`SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS uniqueVisitors FROM site_visits${where}`), { visits: 0, uniqueVisitors: 0 }),
    safeFirst(db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published FROM career_jobs"), { total: 0, published: 0 }),
    safeFirst(db.prepare(`SELECT COUNT(*) AS processed, SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS successful, SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) AS revenue FROM payment_records${where}`), { processed: 0, successful: 0, revenue: 0 }),
    safeFirst(db.prepare(`SELECT COUNT(*) AS processed, SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS successful, SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS revenue FROM yoco_orders${where}`), { processed: 0, successful: 0, revenue: 0 }),
    safeAll<{ day: string; visits: number }>(db.prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS visits FROM site_visits${where} GROUP BY substr(created_at, 1, 10) ORDER BY day`)),
    safeAll<{ path: string; visits: number }>(db.prepare(`SELECT path, COUNT(*) AS visits FROM site_visits${where} GROUP BY path ORDER BY visits DESC LIMIT 10`)),
    safeAll<{ referrer: string | null; visits: number }>(db.prepare(`SELECT referrer, COUNT(*) AS visits FROM site_visits${where} GROUP BY referrer ORDER BY visits DESC LIMIT 10`)),
  ]);
  const successfulTransactions = Number(payments.successful || 0) + Number(legacyPayments.successful || 0);
  const processedPayments = Number(payments.processed || 0) + Number(legacyPayments.processed || 0);
  const revenueCents = Number(payments.revenue || 0) + Number(legacyPayments.revenue || 0);

  return {
    range: url.searchParams.get("range") || "all",
    kpis: {
      visits: Number(traffic.visits || 0),
      uniqueVisitors: Number(traffic.uniqueVisitors || 0),
      users,
      usersTotal,
      activeUsers: Number(activeUsers.count || 0),
      inactiveUsers: Math.max(0, usersTotal - Number(activeUsers.count || 0)),
      successfulTransactions,
      processedPayments,
      revenueCents,
      paymentConversionRate: processedPayments ? (successfulTransactions / processedPayments) * 100 : 0,
      coachingApplications: 0,
      coachingTotal: 0,
      coachingPending: 0,
      coachingApproved: 0,
      jobsCatalog: Number(jobs.total || 0),
      jobsPublished: Number(jobs.published || 0),
      jobsDraft: 0,
      jobsArchived: 0,
      activeTemplates: Number(templates.count || 0),
    },
    visitsByDay,
    topPaths: topPaths.map((row) => ({ ...row, path: safeAggregatePath(row.path) })),
    topReferrers: topReferrers.map((row) => ({ ...row, referrer: safeReferrerOrigin(row.referrer) })),
    health: { api: "ok", database: "ok", jobSearch: "available", checkedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
}

export async function handleCvAdmin(request: Request, env: D1Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/api/templates") {
    if (request.method !== "GET") return json(405, { error: "Method not allowed." });
    try {
      await ensureTemplatesTable(env.DB);
      const rows = await env.DB.prepare(
        `SELECT id, name, description, category, preview_url, active, created_at, updated_at,
                definition_json
         FROM templates
         WHERE active = 1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
      ).all<TemplateRow>();
      return json(200, { success: true, templates: rows.results || [] });
    } catch (error) {
      console.error("[templates] Could not load the live catalog", error);
      return json(500, { success: false, error: "Could not load the template catalog." });
    }
  }
  const assetMatch = /^\/api\/templates\/assets\/(templates\/[a-f0-9-]{36}\.(?:jpg|png|webp))$/i.exec(path);
  if (assetMatch) {
    if (request.method !== "GET" && request.method !== "HEAD") return json(405, { error: "Method not allowed." });
    if (!env.TEMPLATE_ASSETS) return json(503, { error: "Template image storage is unavailable." });
    const key = templateAssetKey(assetMatch[1]);
    if (!key) return json(404, { error: "Template image not found." });
    const object = await env.TEMPLATE_ASSETS.get(key);
    if (!object) return json(404, { error: "Template image not found." });
    const headers = new Headers({
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "cdn-cache-control": "no-store",
      "surrogate-control": "no-store",
      "content-type": object.httpMetadata?.contentType || "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
  }
  if (path === "/api/analytics/visit") {
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });
    if (!env.DB) return json(503, { error: "Analytics storage is unavailable." });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const pagePath = String(body?.path || "/").split(/[?#]/, 1)[0].slice(0, 240);
    if (pagePath.startsWith("/admin")) return new Response(null, { status: 204 });
    const rawVisitor = String(body?.visitorId || "anonymous").slice(0, 160);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawVisitor));
    const visitorHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
    let referrer: string | null = null;
    try { referrer = body?.referrer ? new URL(String(body.referrer)).origin.slice(0, 200) : null; } catch { referrer = null; }
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS site_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, referrer TEXT,
      visitor_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_site_visits_created ON site_visits(created_at DESC)").run();
    await env.DB.prepare("INSERT INTO site_visits (path, referrer, visitor_id) VALUES (?, ?, ?)").bind(pagePath, referrer, visitorHash).run();
    return new Response(null, { status: 204 });
  }
  if (!path.startsWith("/api/admin/")) return null;
  if (!env.DB) return json(503, { error: "The BonList database is unavailable." });
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json(401, { error: "Please sign in as an administrator." });
  if (!user.is_admin) return json(403, { error: "Administrator access is required." });

  if (path.startsWith("/api/admin/diagnostics")) {
    return json(410, { error: "CV review records are not available in the admin console." });
  }

  if (path === "/api/admin/me") {
    return request.method === "GET"
      ? json(200, { id: user.id, email: user.email, name: user.name, isPrimary: true, role: "admin", permissions: ["*"] })
      : json(405, { error: "Method not allowed" });
  }

  if ((path === "/api/admin/overview" || path === "/api/admin/metrics") && request.method === "GET") {
    try {
      const overview = await buildOverview(env.DB, url);
      if (path.endsWith("/metrics")) {
        return json(200, {
          success: true,
          data: {
            visits: overview.kpis.visits,
            totalUsers: overview.kpis.usersTotal,
            uniqueVisitors: overview.kpis.uniqueVisitors,
            successfulTransactions: overview.kpis.successfulTransactions,
            processedPayments: overview.kpis.processedPayments,
            revenueCents: overview.kpis.revenueCents,
            paymentConversionRate: overview.kpis.paymentConversionRate,
            activeTemplates: overview.kpis.activeTemplates,
            updatedAt: overview.updatedAt,
          },
        });
      }
      return json(200, {
        ...overview,
        success: true,
        data: {
          visits: overview.kpis.visits,
          totalUsers: overview.kpis.usersTotal,
          uniqueVisitors: overview.kpis.uniqueVisitors,
          successfulTransactions: overview.kpis.successfulTransactions,
          processedPayments: overview.kpis.processedPayments,
          revenueCents: overview.kpis.revenueCents,
          paymentConversionRate: overview.kpis.paymentConversionRate,
          activeTemplates: overview.kpis.activeTemplates,
          updatedAt: overview.updatedAt,
        },
      });
    } catch (error) {
      console.error("[admin] Could not load overview", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not load admin overview." });
    }
  }

  if (path === "/api/admin/traffic" && request.method === "GET") {
    try {
      const overview = await buildOverview(env.DB, url);
      const start = rangeStart(url);
      const where = dateClause(start);
      const repeat = await safeFirst(env.DB.prepare(
        `SELECT SUM(CASE WHEN hits > 1 THEN 1 ELSE 0 END) AS returningVisitors,
                SUM(CASE WHEN hits = 1 THEN 1 ELSE 0 END) AS newVisitors
         FROM (SELECT visitor_id, COUNT(*) AS hits FROM site_visits${where} GROUP BY visitor_id)`,
      ), { returningVisitors: 0, newVisitors: 0 });
      return json(200, {
        range: overview.range,
        totals: {
          visits: overview.kpis.visits,
          uniqueVisitors: overview.kpis.uniqueVisitors,
          returningVisitors: Number(repeat.returningVisitors || 0),
          newVisitors: Number(repeat.newVisitors || 0),
        },
        visitsByDay: overview.visitsByDay,
        topPaths: overview.topPaths,
        topReferrers: overview.topReferrers,
      });
    } catch (error) {
      console.error("[admin] Could not load aggregate traffic", error);
      return json(500, { error: "Could not load aggregate traffic." });
    }
  }

  if (path === "/api/admin/templates" && request.method === "GET") {
    try {
      try {
        await ensureTemplatesTable(env.DB);
      } catch (error) {
        console.error("[admin] Could not initialize generated template storage", error);
        return json(500, { success: false, error: "Template storage could not be initialized." });
      }
      const term = (url.searchParams.get("q") || "").trim().slice(0, 100);
      const category = (url.searchParams.get("category") || "").trim().slice(0, 80);
      const filters: string[] = ["deleted_at IS NULL"];
      const bindings: string[] = [];
      if (term) {
        filters.push("(id LIKE ? OR name LIKE ? OR description LIKE ?)");
        bindings.push(`%${term}%`, `%${term}%`, `%${term}%`);
      }
      if (category) {
        filters.push("category = ? COLLATE NOCASE");
        bindings.push(category);
      }
      const where = `WHERE ${filters.join(" AND ")}`;
      const rows = await env.DB.prepare(`SELECT * FROM templates ${where} ORDER BY created_at DESC`)
        .bind(...bindings).all<TemplateRow>();
      const categories = await env.DB.prepare(
        "SELECT DISTINCT category FROM templates WHERE deleted_at IS NULL AND category <> '' ORDER BY category COLLATE NOCASE",
      ).all<{ category: string }>();
      return json(200, { success: true, templates: rows.results || [], categories: (categories.results || []).map((row) => row.category) });
    } catch (error) {
      console.error("[admin] Could not load templates", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not load templates." });
    }
  }

  if (path === "/api/admin/templates/generate" && request.method === "POST") {
    if (!env.TEMPLATE_ASSETS) return json(503, { success: false, error: "Template image storage is not configured." });
    const apiKey = String(env.GEMINI_API_KEY || "").trim();
    if (!apiKey) return json(503, { success: false, error: "Template image generation is not configured." });
    const requestLength = Number(request.headers.get("content-length") || 0);
    if (requestLength > 5 * 1024 * 1024 + 128 * 1024) {
      return json(413, { success: false, error: "Template images must be no larger than 5 MB." });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json(400, { success: false, error: "Upload one PNG, JPEG, or WebP template image." });
    }
    const file = form.get("image");
    if (!(file instanceof File)) return json(400, { success: false, error: "Choose a template image to upload." });
    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      return json(413, { success: false, error: "Template images must be no larger than 5 MB." });
    }
    const imageType = templateAssetMimeType(file);
    if (!imageType) return json(415, { success: false, error: "Use a PNG, JPEG, or WebP image." });
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    const isPng = imageType.mimeType === "image/png" && imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4e && imageBytes[3] === 0x47;
    const isJpeg = imageType.mimeType === "image/jpeg" && imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff;
    const isWebp = imageType.mimeType === "image/webp" && String.fromCharCode(...imageBytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...imageBytes.subarray(8, 12)) === "WEBP";
    if (!isPng && !isJpeg && !isWebp) return json(415, { success: false, error: "The uploaded file is not a valid PNG, JPEG, or WebP image." });

    let generated: Awaited<ReturnType<typeof generateTemplateDesignFromImage>>;
    try {
      generated = await generateTemplateDesignFromImage({
        apiKey,
        model: env.GEMINI_MODEL,
        mimeType: imageType.mimeType,
        imageBase64: bytesToBase64(imageBytes),
      });
    } catch (error) {
      console.error("[admin] Gemini could not analyze the template image", error);
      return json(502, { success: false, error: "Gemini could not analyze this image. Please try a clearer template image." });
    }
    const name = safeTemplateText(generated.name, 120);
    const description = safeTemplateText(generated.description, 1000);
    const category = safeTemplateText(generated.category, 80) || "AI-generated";
    const design = parseTemplateDesign(generated.design);
    if (!name || !description || !design) {
      console.error("[admin] Gemini returned an invalid template design");
      return json(502, { success: false, error: "Gemini returned an incomplete template design. Please try again." });
    }
    await ensureTemplatesTable(env.DB);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 54) || "custom_template";
    const id = `${slug}_${crypto.randomUUID().slice(0, 8)}`;
    const assetKey = `templates/${crypto.randomUUID()}.${imageType.extension}`;
    const previewUrl = `/api/templates/assets/${assetKey}`;
    let uploaded = false;
    try {
      await env.TEMPLATE_ASSETS.put(assetKey, imageBytes, {
        httpMetadata: { contentType: imageType.mimeType, cacheControl: "no-store" },
      });
      uploaded = true;
      const saved = await env.DB.prepare(
        `INSERT INTO templates
         (id, name, description, category, preview_url, active, created_at, updated_at, deleted_at, definition_json, asset_key)
         VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), NULL, ?, ?)`,
      ).bind(id, name, description, category, previewUrl, JSON.stringify(design), assetKey).run();
      if (!saved.meta.changes) throw new Error("Generated template was not inserted.");
      const template = await env.DB.prepare(
        "SELECT id, name, description, category, preview_url, active, created_at, updated_at, definition_json FROM templates WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      ).bind(id).first<TemplateRow>();
      if (!template) throw new Error("Generated template was not persisted.");
      return json(201, { success: true, template });
    } catch (error) {
      try {
        await env.DB.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();
      } catch (cleanupError) {
        console.error("[admin] Could not remove an incomplete generated template record", cleanupError);
      }
      if (uploaded) {
        try {
          await env.TEMPLATE_ASSETS.delete(assetKey);
        } catch (cleanupError) {
          console.error("[admin] Could not remove an unreferenced generated template image", cleanupError);
        }
      }
      console.error("[admin] Could not save the generated template", error);
      return json(500, { success: false, error: "The generated template could not be saved." });
    }
  }

  if (path === "/api/admin/templates" && request.method === "POST") {
    try {
      await ensureTemplatesTable(env.DB);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const rawItems = Array.isArray(body?.templates) ? body.templates.slice(0, 100) : [body];
      const inputs = rawItems.map(templateInput);
      if (!inputs.length || inputs.some((item) => !item)) {
        return json(400, { success: false, error: "Each template needs a valid id and name." });
      }
      try {
        await env.DB.batch(inputs.map((item) => {
          const template = item as TemplateInput;
          return env.DB.prepare(
            `INSERT INTO templates (id, name, description, category, preview_url, active, created_at, updated_at, deleted_at, definition_json, asset_key)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL, ?, NULL)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
               category=excluded.category, preview_url=COALESCE(excluded.preview_url, templates.preview_url), active=excluded.active,
               definition_json=COALESCE(excluded.definition_json, templates.definition_json),
               updated_at=datetime('now'), deleted_at=NULL`,
          ).bind(template.id, template.name, template.description, template.category, template.previewUrl, template.active, template.definitionJson ?? null);
        }));
      } catch (error) {
        if (String(error).toLowerCase().includes("unique")) {
          return json(409, { success: false, error: "A template with that id already exists." });
        }
        throw error;
      }
      return json(201, { success: true, created: inputs.length });
    } catch (error) {
      console.error("[admin] Could not create templates", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not create templates." });
    }
  }

  if (path === "/api/admin/templates/seed" && request.method === "POST") {
    try {
      await ensureTemplatesTable(env.DB);
      let seeded = 0;
      for (const template of DEFAULT_TEMPLATES) {
        const existing = await env.DB.prepare("SELECT id FROM templates WHERE id = ? AND deleted_at IS NULL LIMIT 1").bind(template.id).first();
        if (existing) continue;
        await insertTemplate(env.DB, template);
        seeded += 1;
      }
      return json(200, { success: true, seeded, total: DEFAULT_TEMPLATES.length });
    } catch (error) {
      console.error("[admin] Could not seed templates", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not seed templates." });
    }
  }

  const templateMatch = /^\/api\/admin\/templates\/([^/]+)$/.exec(path);
  if (templateMatch) {
    const id = decodeURIComponent(templateMatch[1] || "").trim();
    if (!id || id.length > 160) return json(400, { success: false, error: "Invalid template id." });
    try {
      await ensureTemplatesTable(env.DB);
      const existing = await env.DB.prepare("SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL LIMIT 1").bind(id).first<TemplateRow>();
      if (!existing) return json(404, { success: false, error: "Template not found." });
      if (request.method === "GET") return json(200, { success: true, template: existing });
      if (request.method === "PATCH" || request.method === "PUT") {
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        const input = templateInput({ ...(body || {}), id });
        if (!input) return json(400, { success: false, error: "A valid template name is required." });
        await env.DB.prepare(
          `UPDATE templates SET name = ?, description = ?, category = ?, preview_url = ?, active = ?,
             definition_json = COALESCE(?, definition_json), updated_at = datetime('now')
           WHERE id = ? AND deleted_at IS NULL`,
        ).bind(input.name, input.description, input.category, input.previewUrl, input.active, input.definitionJson ?? null, id).run();
        const updated = await env.DB.prepare("SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL LIMIT 1").bind(id).first<TemplateRow>();
        return json(200, { success: true, template: updated });
      }
      if (request.method === "DELETE") {
        const assetKey = existing.asset_key ? templateAssetKey(existing.asset_key) : null;
        if (existing.asset_key && !assetKey) return json(500, { success: false, error: "The template has an invalid asset reference." });
        const deletion = await env.DB.prepare("DELETE FROM templates WHERE id = ? AND deleted_at IS NULL").bind(id).run();
        if (!deletion.meta.changes) return json(404, { success: false, error: "Template not found." });
        if (assetKey) {
          try {
            if (!env.TEMPLATE_ASSETS) throw new Error("Template image storage is unavailable.");
            await env.TEMPLATE_ASSETS.delete(assetKey);
          } catch (error) {
            try {
              await env.DB.prepare(
                `INSERT INTO templates
                 (id, name, description, category, preview_url, active, created_at, updated_at, deleted_at, definition_json, asset_key)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
              ).bind(
                existing.id,
                existing.name,
                existing.description || "",
                existing.category || "CV",
                existing.preview_url || null,
                existing.active === 0 ? 0 : 1,
                existing.created_at || new Date().toISOString(),
                existing.updated_at || new Date().toISOString(),
                existing.definition_json || null,
                assetKey,
              ).run();
            } catch (restoreError) {
              console.error("[admin] Could not restore a template after its image deletion failed", restoreError);
            }
            throw error;
          }
        }
        return json(200, { success: true, id, deleted: true });
      }
      return json(405, { success: false, error: "Method not allowed." });
    } catch (error) {
      console.error("[admin] Could not manage template", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not manage template." });
    }
  }

  return json(404, { error: "Admin route not found." });
}
