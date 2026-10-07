import { getAuthenticatedUser, type D1Env } from "./d1/auth";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

type CountRow = { count: number };
type TemplateRow = Record<string, unknown> & {
  id: string | number;
  name?: string;
  created_at?: string;
};

type TemplateInput = {
  id: string;
  name: string;
  description: string;
  category: string;
  previewUrl: string | null;
  active: number;
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
  return { id, name, description, category, previewUrl, active };
}

async function insertTemplate(db: D1Database, input: TemplateInput) {
  return db.prepare(
    `INSERT INTO templates (id, name, description, category, preview_url, active, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
       category=excluded.category, preview_url=excluded.preview_url, active=excluded.active,
       updated_at=datetime('now'), deleted_at=NULL`,
  ).bind(input.id, input.name, input.description, input.category, input.previewUrl, input.active).run();
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
    deleted_at TEXT
  )`).run();
  try {
    await db.prepare("ALTER TABLE templates ADD COLUMN deleted_at TEXT").run();
  } catch (error) {
    if (!String(error).toLowerCase().includes("duplicate column")) throw error;
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_templates_created ON templates(created_at DESC)").run();
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
      await ensureTemplatesTable(env.DB);
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
            `INSERT INTO templates (id, name, description, category, preview_url, active, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
               category=excluded.category, preview_url=excluded.preview_url, active=excluded.active,
               updated_at=datetime('now'), deleted_at=NULL`,
          ).bind(template.id, template.name, template.description, template.category, template.previewUrl, template.active);
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
          `UPDATE templates SET name = ?, description = ?, category = ?, preview_url = ?, active = ?, updated_at = datetime('now')
           WHERE id = ? AND deleted_at IS NULL`,
        ).bind(input.name, input.description, input.category, input.previewUrl, input.active, id).run();
        const updated = await env.DB.prepare("SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL LIMIT 1").bind(id).first<TemplateRow>();
        return json(200, { success: true, template: updated });
      }
      if (request.method === "DELETE") {
        await env.DB.prepare("UPDATE templates SET active = 0, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").bind(id).run();
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
