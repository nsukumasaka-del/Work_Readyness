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
  if (path !== "/api/admin/me" && !path.startsWith("/api/admin/diagnostics")) return null;
  if (!env.DB) return json(503, { error: "The BonList database is unavailable." });
  const user = await getAuthenticatedUser(request, env.DB);
  if (!user) return json(401, { error: "Please sign in as an administrator." });
  if (!user.isAdmin) return json(403, { error: "Administrator access is required." });

  if (path === "/api/admin/me") {
    return request.method === "GET"
      ? json(200, { id: user.id, email: user.email, name: user.name, isPrimary: true, role: "admin", permissions: ["*"] })
      : json(405, { error: "Method not allowed" });
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
