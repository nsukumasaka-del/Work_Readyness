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
      const rows = await env.DB.prepare("SELECT * FROM templates ORDER BY created_at DESC").all<TemplateRow>();
      return json(200, { success: true, templates: rows.results || [] });
    } catch (error) {
      console.error("[admin] Could not load templates", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not load templates." });
    }
  }

  const templateMatch = /^\/api\/admin\/templates\/([^/]+)$/.exec(path);
  if (templateMatch && request.method === "DELETE") {
    const id = decodeURIComponent(templateMatch[1] || "").trim();
    if (!id || id.length > 160) return json(400, { success: false, error: "Invalid template id." });
    try {
      await ensureTemplatesTable(env.DB);
      const existing = await env.DB.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(id).first();
      if (!existing) return json(404, { success: false, error: "Template not found." });
      await env.DB.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();
      return json(200, { success: true, message: `Template ${id} deleted successfully.` });
    } catch (error) {
      console.error("[admin] Could not delete template", error);
      return json(500, { success: false, error: error instanceof Error ? error.message : "Could not delete template." });
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
