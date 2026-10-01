import { getAuthenticatedUser, type D1Env } from "./d1/auth";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

type ReportRow = {
  id: number;
  user_id: string;
  report_json: string;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
};

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
    `INSERT INTO templates (id, name, description, category, preview_url, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
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
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
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

async function buildOverview(db: D1Database, url: URL) {
  await ensureTemplatesTable(db);
  const start = rangeStart(url);
  const [users, usersTotal, cvReviews, cvReviewsTotal, coaching, coachingTotal, coachingPending, coachingApproved, templates] = await Promise.all([
    countRows(db, "users", start),
    countRows(db, "users", null),
    countRows(db, "cv_reports", start),
    countRows(db, "cv_reports", null),
    countRows(db, "coaching_applications", start),
    countRows(db, "coaching_applications", null),
    db.prepare("SELECT COUNT(*) AS count FROM coaching_applications WHERE status = 'pending'").first<CountRow>().then((row) => Number(row?.count || 0)),
    db.prepare("SELECT COUNT(*) AS count FROM coaching_applications WHERE status = 'approved'").first<CountRow>().then((row) => Number(row?.count || 0)),
    countRows(db, "templates", null),
  ]);

  const latestProfile = await db.prepare(
    "SELECT target_role FROM career_profiles ORDER BY created_at DESC, id DESC LIMIT 1",
  ).first<{ target_role: string | null }>();

  return {
    range: url.searchParams.get("range") || "all",
    kpis: {
      visits: 0,
      uniqueVisitors: 0,
      users,
      usersTotal,
      activeUsers: usersTotal,
      inactiveUsers: 0,
      cvReviews,
      cvReviewsTotal,
      coachingApplications: coaching,
      coachingTotal,
      coachingPending,
      coachingApproved,
      jobsCatalog: 0,
      jobsPublished: 0,
      jobsDraft: 0,
      jobsArchived: 0,
      avgAuthenticity: 0,
      avgAts: 0,
      activeTemplates: templates,
    },
    signals: {
      profileCount: usersTotal,
      diagnosticScore: null,
      interviewCompletedCount: cvReviewsTotal,
      latestRole: latestProfile?.target_role || null,
    },
    visitsByDay: [],
    topPaths: [],
    topReferrers: [],
    activity: [],
    health: { api: "ok", database: "ok", jobSearch: "available", checkedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
}

function publicRow(row: ReportRow) {
  const report = JSON.parse(row.report_json) as Record<string, unknown>;
  return {
    ...report,
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
  };
}

export async function handleCvAdmin(request: Request, env: D1Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.startsWith("/api/admin/")) return null;
  if (!env.DB) return json(503, { error: "The BonList database is unavailable." });
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json(401, { error: "Please sign in as an administrator." });
  if (!user.is_admin) return json(403, { error: "Administrator access is required." });

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
            cvReviews: overview.kpis.cvReviewsTotal,
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
          cvReviews: overview.kpis.cvReviewsTotal,
          activeTemplates: overview.kpis.activeTemplates,
          updatedAt: overview.updatedAt,
        },
      });
    } catch (error) {
      console.error("[admin] Could not load overview", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not load admin overview." });
    }
  }

  if (path === "/api/admin/templates" && request.method === "GET") {
    try {
      await ensureTemplatesTable(env.DB);
      const term = (url.searchParams.get("q") || "").trim().slice(0, 100);
      const category = (url.searchParams.get("category") || "").trim().slice(0, 80);
      const filters: string[] = [];
      const bindings: string[] = [];
      if (term) {
        filters.push("(id LIKE ? OR name LIKE ? OR description LIKE ?)");
        bindings.push(`%${term}%`, `%${term}%`, `%${term}%`);
      }
      if (category) {
        filters.push("category = ? COLLATE NOCASE");
        bindings.push(category);
      }
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await env.DB.prepare(`SELECT * FROM templates ${where} ORDER BY created_at DESC`)
        .bind(...bindings).all<TemplateRow>();
      const categories = await env.DB.prepare(
        "SELECT DISTINCT category FROM templates WHERE category <> '' ORDER BY category COLLATE NOCASE",
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
            `INSERT INTO templates (id, name, description, category, preview_url, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
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
        const existing = await env.DB.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(template.id).first();
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
      const existing = await env.DB.prepare("SELECT * FROM templates WHERE id = ? LIMIT 1").bind(id).first<TemplateRow>();
      if (!existing) return json(404, { success: false, error: "Template not found." });
      if (request.method === "GET") return json(200, { success: true, template: existing });
      if (request.method === "PATCH" || request.method === "PUT") {
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        const input = templateInput({ ...(body || {}), id });
        if (!input) return json(400, { success: false, error: "A valid template name is required." });
        await env.DB.prepare(
          `UPDATE templates SET name = ?, description = ?, category = ?, preview_url = ?, active = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).bind(input.name, input.description, input.category, input.previewUrl, input.active, id).run();
        const updated = await env.DB.prepare("SELECT * FROM templates WHERE id = ? LIMIT 1").bind(id).first<TemplateRow>();
        return json(200, { success: true, template: updated });
      }
      if (request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();
        return json(200, { success: true, message: `Template ${id} deleted successfully.` });
      }
      return json(405, { success: false, error: "Method not allowed." });
    } catch (error) {
      console.error("[admin] Could not manage template", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not manage template." });
    }
  }

  if (path === "/api/admin/diagnostics" && request.method === "GET") {
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "25", 10) || 25));
    const term = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const where = term ? "WHERE r.report_json LIKE ? OR u.email LIKE ? OR u.name LIKE ?" : "";
    const bindings = term ? [`%${term}%`, `%${term}%`, `%${term}%`] : [];
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM cv_reports r JOIN users u ON u.id = r.user_id ${where}`,
    ).bind(...bindings).first<{ total: number }>();
    const rows = await env.DB.prepare(
      `SELECT r.id, r.user_id, r.report_json, r.created_at, u.email AS user_email, u.name AS user_name
       FROM cv_reports r JOIN users u ON u.id = r.user_id ${where}
       ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    ).bind(...bindings, limit, (page - 1) * limit).all<ReportRow>();
    return json(200, {
      reports: (rows.results || []).map(publicRow),
      total: count?.total || 0,
      page, limit,
    });
  }

  if (path === "/api/admin/diagnostics/bulk-delete" && request.method === "POST") {
    const body = await request.json().catch(() => null) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id): id is number => Number.isSafeInteger(id) && id > 0).slice(0, 100)
      : [];
    if (!ids.length) return json(400, { error: "No valid report IDs were supplied." });
    await env.DB.prepare(`DELETE FROM cv_reports WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).run();
    return json(200, { deleted: ids.length });
  }

  const match = /^\/api\/admin\/diagnostics\/(\d+)$/.exec(path);
  if (match) {
    const id = Number(match[1]);
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM cv_reports WHERE id = ?").bind(id).run();
      return json(200, { deleted: true });
    }
    if (request.method !== "GET") return json(405, { error: "Method not allowed" });
    const row = await env.DB.prepare(
      `SELECT r.id, r.user_id, r.report_json, r.created_at, u.email AS user_email, u.name AS user_name
       FROM cv_reports r JOIN users u ON u.id = r.user_id WHERE r.id = ? LIMIT 1`,
    ).bind(id).first<ReportRow>();
    return row ? json(200, publicRow(row)) : json(404, { error: "CV review not found." });
  }

  return json(404, { error: "Admin route not found." });
}
