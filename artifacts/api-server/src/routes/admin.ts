import { Router, type IRouter, type Request } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  adminAuditLogTable,
  adminUsersTable,
  coachingApplicationsTable,
  db,
  diagnosticReportsTable,
  jobsTable,
  profilesTable,
  programmesTable,
  siteVisitsTable,
  subscriptionsTable,
} from "@workspace/db";
import {
  ADMIN_ROLES,
  addAdmin,
  adminHasPermission,
  authenticateAdmin,
  createAdminSession,
  ensurePrimaryAdmin,
  getAdminFromToken,
  getBearerToken,
  getRequestAdmin,
  listAdmins,
  MAX_ADMINS,
  normalizeAdminRole,
  removeAdmin,
  requireAdmin,
  requirePermission,
  revokeAdminSession,
  toPublicAdmin,
  updateAdmin,
  type AdminPermission,
} from "../lib/admin-auth";
import {
  createAdminNotification,
  getPlatformSettings,
  listAuditLogs,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updatePlatformSettings,
  writeAuditLog,
} from "../lib/admin-ops";
import { daysBetween, resolveEntitlement } from "../lib/billing";

const router: IRouter = Router();

const ALL_PERMISSIONS: AdminPermission[] = [
  "manage_admins",
  "manage_users",
  "manage_coaching",
  "manage_diagnostics",
  "manage_jobs",
  "manage_settings",
  "view_audit",
  "view_traffic",
  "view_overview",
];

const COACHING_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "scheduled",
  "completed",
  "cancelled",
  "received",
  "reviewing",
  "contacted",
  "closed",
] as const;

const COACHING_PRIORITIES = ["low", "normal", "high"] as const;
const JOB_STATUSES = ["draft", "published", "archived", "expired"] as const;
const USER_STATUSES = ["active", "inactive"] as const;

type RangeResult = {
  label: string;
  days: number;
  since: Date | null;
  until: Date | null;
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function parseRange(
  raw: unknown,
  fromRaw?: unknown,
  toRaw?: unknown,
): RangeResult {
  const fromStr = typeof fromRaw === "string" ? fromRaw.trim() : "";
  const toStr = typeof toRaw === "string" ? toRaw.trim() : "";
  if (fromStr || toStr) {
    const since = fromStr && !Number.isNaN(Date.parse(fromStr)) ? new Date(fromStr) : null;
    const until = toStr && !Number.isNaN(Date.parse(toStr)) ? new Date(toStr) : null;
    return { label: "custom", days: 0, since, until };
  }

  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "30d";
  if (value === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { label: "today", days: 1, since: start, until: null };
  }
  if (value === "7d") return { label: "7d", days: 7, since: daysAgo(7), until: null };
  if (value === "90d") return { label: "90d", days: 90, since: daysAgo(90), until: null };
  if (value === "all") return { label: "all", days: 0, since: null, until: null };
  return { label: "30d", days: 30, since: daysAgo(30), until: null };
}

function rangeConditions(
  column: any,
  range: RangeResult,
) {
  const parts = [];
  if (range.since) parts.push(gte(column, range.since));
  if (range.until) parts.push(lte(column, range.until));
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

function actorFromReq(req: Request): { id: number; email: string } {
  const admin = getRequestAdmin(req);
  return {
    id: admin?.id ?? 0,
    email: admin?.email || "unknown",
  };
}

function stripPassword<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

function parseUserAgent(ua: string | null | undefined): {
  device: "desktop" | "mobile" | "tablet" | "other";
  browser: "chrome" | "firefox" | "safari" | "edge" | "other";
} {
  const value = (ua || "").toLowerCase();
  let device: "desktop" | "mobile" | "tablet" | "other" = "other";
  if (/ipad|tablet|kindle|silk/.test(value)) device = "tablet";
  else if (/mobi|iphone|android|phone/.test(value)) device = "mobile";
  else if (value) device = "desktop";

  let browser: "chrome" | "firefox" | "safari" | "edge" | "other" = "other";
  if (/edg\//.test(value) || /edge/.test(value)) browser = "edge";
  else if (/chrome|crios/.test(value) && !/edg\//.test(value)) browser = "chrome";
  else if (/firefox|fxios/.test(value)) browser = "firefox";
  else if (/safari/.test(value) && !/chrome|crios|android/.test(value)) browser = "safari";

  return { device, browser };
}

function parsePagination(req: Request, defaultLimit = 25) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeCoachingStatus(status: string): string {
  if (status === "received") return "pending";
  return status;
}

function normalizeCoachingRow<T extends { status: string }>(row: T): T {
  return { ...row, status: normalizeCoachingStatus(row.status) };
}

function isPendingCoachingStatus() {
  return or(
    eq(coachingApplicationsTable.status, "pending"),
    eq(coachingApplicationsTable.status, "received"),
  );
}

function parseIdParam(raw: string | string[]): number | null {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
}

async function liveHealth() {
  const checkedAt = new Date().toISOString();
  let database: "ok" | "degraded" = "ok";
  try {
    await db.select({ value: count() }).from(profilesTable).limit(1);
  } catch {
    database = "degraded";
  }
  const jobSearch =
    process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY ? "ok" : "degraded";
  return {
    api: "ok" as const,
    database,
    jobSearch: jobSearch as "ok" | "degraded",
    checkedAt,
  };
}

// ─── Auth ───────────────────────────────────────────────────────────────────

router.post("/admin/login", async (req, res) => {
  await ensurePrimaryAdmin();
  const email = String(req.body?.email || req.body?.username || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  const admin = await authenticateAdmin(email, password);
  if (!admin) {
    res.status(401).json({ error: "Invalid admin credentials" });
    return;
  }
  const session = await createAdminSession(admin.id);
  await writeAuditLog({
    admin: { id: admin.id, email: admin.email },
    action: "login",
    entityType: "admin",
    entityId: admin.id,
    summary: `${admin.email} signed in`,
  });
  req.log.info({ adminId: admin.id, email: admin.email }, "Admin signed in");
  const publicAdmin = toPublicAdmin(admin);
  res.json({
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    ...publicAdmin,
  });
});

router.post("/admin/logout", requireAdmin, async (req, res) => {
  const actor = actorFromReq(req);
  await writeAuditLog({
    admin: actor,
    action: "logout",
    entityType: "admin",
    entityId: actor.id,
    summary: `${actor.email} signed out`,
  });
  await revokeAdminSession(getBearerToken(req));
  res.json({ ok: true });
});

router.get("/admin/me", requireAdmin, async (req, res) => {
  const admin = getRequestAdmin(req) ?? (await getAdminFromToken(getBearerToken(req)));
  if (!admin) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  const role = normalizeAdminRole(admin);
  const permissions = ALL_PERMISSIONS.filter((p) => adminHasPermission(admin, p));
  res.json({
    ...toPublicAdmin(admin),
    role,
    permissions,
  });
});

// ─── Admins ─────────────────────────────────────────────────────────────────

router.get("/admin/admins", requireAdmin, async (_req, res) => {
  const admins = await listAdmins();
  res.json({
    maxAdmins: MAX_ADMINS,
    admins: admins.map(toPublicAdmin),
  });
});

router.post(
  "/admin/admins",
  requireAdmin,
  requirePermission("manage_admins"),
  async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim();
      const password = String(req.body?.password || "");
      const roleRaw = String(req.body?.role || "admin").trim();
      const role = ADMIN_ROLES.includes(roleRaw as (typeof ADMIN_ROLES)[number])
        ? (roleRaw as (typeof ADMIN_ROLES)[number])
        : "admin";

      if (!name || !email || password.length < 6) {
        res.status(400).json({
          error: "Name, email, and a password of at least 6 characters are required",
        });
        return;
      }

      const created = await addAdmin({ name, email, password, role });
      const actor = actorFromReq(req);
      await writeAuditLog({
        admin: actor,
        action: "create",
        entityType: "admin",
        entityId: created.id,
        summary: `Added admin ${created.email}`,
        metadata: { role: created.role },
      });
      await createAdminNotification({
        type: "admin",
        title: "New administrator",
        body: `${created.name} (${created.email}) was added as ${normalizeAdminRole(created)}`,
        entityType: "admin",
        entityId: created.id,
      });
      res.status(201).json({ admin: toPublicAdmin(created) });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Could not add admin",
      });
    }
  },
);

router.patch(
  "/admin/admins/:id",
  requireAdmin,
  requirePermission("manage_admins"),
  async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Invalid admin id" });
        return;
      }
      const name = req.body?.name != null ? String(req.body.name) : undefined;
      const roleRaw = req.body?.role != null ? String(req.body.role).trim() : undefined;
      const status = req.body?.status != null ? String(req.body.status).trim() : undefined;
      const password = req.body?.password != null ? String(req.body.password) : undefined;
      const role =
        roleRaw && ADMIN_ROLES.includes(roleRaw as (typeof ADMIN_ROLES)[number])
          ? (roleRaw as (typeof ADMIN_ROLES)[number])
          : undefined;

      const updated = await updateAdmin(id, { name, role, status, password });
      const actor = actorFromReq(req);
      await writeAuditLog({
        admin: actor,
        action: "update",
        entityType: "admin",
        entityId: id,
        summary: `Updated admin ${updated.email}`,
        metadata: { name, role, status },
      });
      res.json({ admin: toPublicAdmin(updated) });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Could not update admin",
      });
    }
  },
);

router.delete(
  "/admin/admins/:id",
  requireAdmin,
  requirePermission("manage_admins"),
  async (req, res) => {
    try {
      const requester = getRequestAdmin(req);
      if (!requester) {
        res.status(401).json({ error: "Admin authentication required" });
        return;
      }
      if (!requester.isPrimary) {
        res.status(403).json({ error: "Only the primary admin can remove administrators" });
        return;
      }
      const id = parseIdParam(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Invalid admin id" });
        return;
      }
      await removeAdmin(id, requester.id);
      await writeAuditLog({
        admin: { id: requester.id, email: requester.email },
        action: "delete",
        entityType: "admin",
        entityId: id,
        summary: `Removed admin #${id}`,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Could not remove admin",
      });
    }
  },
);

// ─── Overview ───────────────────────────────────────────────────────────────

router.get("/admin/overview", requireAdmin, async (req, res) => {
  const range = parseRange(req.query.range, req.query.from, req.query.to);
  const visitFilter = rangeConditions(siteVisitsTable.createdAt, range);
  const profileFilter = rangeConditions(profilesTable.createdAt, range);
  const diagnosticFilter = rangeConditions(diagnosticReportsTable.createdAt, range);
  const coachingFilter = rangeConditions(coachingApplicationsTable.createdAt, range);

  const [
    visitRows,
    uniqueVisitorRows,
    profileRows,
    totalProfiles,
    activeUsers,
    inactiveUsers,
    diagnosticRows,
    totalDiagnostics,
    coachingRows,
    totalCoaching,
    coachingPending,
    coachingApproved,
    jobRows,
    jobsPublished,
    jobsDraft,
    jobsArchived,
    scoreRows,
    topPaths,
    topReferrers,
    visitsByDay,
    recentProfiles,
    recentDiagnostics,
    recentCoaching,
    recentJobs,
    recentAudit,
  ] = await Promise.all([
    db.select({ value: count() }).from(siteVisitsTable).where(visitFilter),
    db
      .select({ value: sql<number>`count(distinct ${siteVisitsTable.visitorId})` })
      .from(siteVisitsTable)
      .where(visitFilter),
    db.select({ value: count() }).from(profilesTable).where(profileFilter),
    db.select({ value: count() }).from(profilesTable),
    db
      .select({ value: count() })
      .from(profilesTable)
      .where(eq(profilesTable.status, "active")),
    db
      .select({ value: count() })
      .from(profilesTable)
      .where(eq(profilesTable.status, "inactive")),
    db.select({ value: count() }).from(diagnosticReportsTable).where(diagnosticFilter),
    db.select({ value: count() }).from(diagnosticReportsTable),
    db.select({ value: count() }).from(coachingApplicationsTable).where(coachingFilter),
    db.select({ value: count() }).from(coachingApplicationsTable),
    db
      .select({ value: count() })
      .from(coachingApplicationsTable)
      .where(isPendingCoachingStatus()),
    db
      .select({ value: count() })
      .from(coachingApplicationsTable)
      .where(eq(coachingApplicationsTable.status, "approved")),
    db.select({ value: count() }).from(jobsTable),
    db.select({ value: count() }).from(jobsTable).where(eq(jobsTable.status, "published")),
    db.select({ value: count() }).from(jobsTable).where(eq(jobsTable.status, "draft")),
    db.select({ value: count() }).from(jobsTable).where(eq(jobsTable.status, "archived")),
    db
      .select({
        avgAuthenticity: sql<number>`coalesce(avg(${diagnosticReportsTable.authenticityScore}), 0)`,
        avgAts: sql<number>`coalesce(avg(${diagnosticReportsTable.atsScore}), 0)`,
      })
      .from(diagnosticReportsTable)
      .where(diagnosticFilter),
    db
      .select({ path: siteVisitsTable.path, visits: count() })
      .from(siteVisitsTable)
      .where(visitFilter)
      .groupBy(siteVisitsTable.path)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        referrer: sql<string>`coalesce(${siteVisitsTable.referrer}, 'direct')`,
        visits: count(),
      })
      .from(siteVisitsTable)
      .where(visitFilter)
      .groupBy(sql`coalesce(${siteVisitsTable.referrer}, 'direct')`)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${siteVisitsTable.createdAt}), 'YYYY-MM-DD')`,
        visits: count(),
      })
      .from(siteVisitsTable)
      .where(visitFilter ?? gte(siteVisitsTable.createdAt, daysAgo(30)))
      .groupBy(sql`date_trunc('day', ${siteVisitsTable.createdAt})`)
      .orderBy(sql`date_trunc('day', ${siteVisitsTable.createdAt})`),
    db.select().from(profilesTable).orderBy(desc(profilesTable.createdAt)).limit(8),
    db
      .select()
      .from(diagnosticReportsTable)
      .orderBy(desc(diagnosticReportsTable.createdAt))
      .limit(8),
    db
      .select()
      .from(coachingApplicationsTable)
      .orderBy(desc(coachingApplicationsTable.createdAt))
      .limit(8),
    db.select().from(jobsTable).orderBy(desc(jobsTable.updatedAt)).limit(8),
    db.select().from(adminAuditLogTable).orderBy(desc(adminAuditLogTable.createdAt)).limit(8),
  ]);

  const activity = [
    ...recentProfiles.map((profile) => ({
      type: "user" as const,
      id: profile.id,
      title: `${profile.name} created a profile`,
      detail: profile.email,
      at: profile.createdAt,
      section: "users" as const,
    })),
    ...recentDiagnostics.map((report) => ({
      type: "diagnostic" as const,
      id: report.id,
      title: `CV review · ${report.fileName}`,
      detail: `ATS ${report.atsScore} · Authenticity ${report.authenticityScore}`,
      at: report.createdAt,
      section: "diagnostics" as const,
    })),
    ...recentCoaching.map((app) => ({
      type: "coaching" as const,
      id: app.id,
      title: `Coaching application · ${app.name}`,
      detail: `${app.paymentPlan} · ${normalizeCoachingStatus(app.status)}`,
      at: app.createdAt,
      section: "coaching" as const,
    })),
    ...recentJobs.map((job) => ({
      type: "job" as const,
      id: job.id,
      title: `Job · ${job.title}`,
      detail: `${job.company} · ${job.status}`,
      at: job.updatedAt,
      section: "jobs" as const,
    })),
    ...recentAudit.map((log) => ({
      type: "audit" as const,
      id: log.id,
      title: log.summary,
      detail: `${log.adminEmail} · ${log.action}`,
      at: log.createdAt,
      section: "admins" as const,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 25);

  const health = await liveHealth();

  res.json({
    range: range.label,
    kpis: {
      visits: Number(visitRows[0]?.value || 0),
      uniqueVisitors: Number(uniqueVisitorRows[0]?.value || 0),
      users: Number(profileRows[0]?.value || 0),
      usersTotal: Number(totalProfiles[0]?.value || 0),
      activeUsers: Number(activeUsers[0]?.value || 0),
      inactiveUsers: Number(inactiveUsers[0]?.value || 0),
      cvReviews: Number(diagnosticRows[0]?.value || 0),
      cvReviewsTotal: Number(totalDiagnostics[0]?.value || 0),
      coachingApplications: Number(coachingRows[0]?.value || 0),
      coachingTotal: Number(totalCoaching[0]?.value || 0),
      coachingPending: Number(coachingPending[0]?.value || 0),
      coachingApproved: Number(coachingApproved[0]?.value || 0),
      jobsCatalog: Number(jobRows[0]?.value || 0),
      jobsPublished: Number(jobsPublished[0]?.value || 0),
      jobsDraft: Number(jobsDraft[0]?.value || 0),
      jobsArchived: Number(jobsArchived[0]?.value || 0),
      avgAuthenticity: Math.round(Number(scoreRows[0]?.avgAuthenticity || 0)),
      avgAts: Math.round(Number(scoreRows[0]?.avgAts || 0)),
    },
    signals: {
      profileCount: Number(totalProfiles[0]?.value || 0),
      diagnosticScore: recentDiagnostics[0]?.authenticityScore ?? null,
      interviewCompletedCount: recentDiagnostics.length > 0 ? recentDiagnostics.length : 0,
      latestRole: recentProfiles.find((p) => p.targetRole?.trim())?.targetRole || null,
    },
    visitsByDay: visitsByDay.map((row) => ({
      day: row.day,
      visits: Number(row.visits),
    })),
    topPaths: topPaths.map((row) => ({
      path: row.path,
      visits: Number(row.visits),
    })),
    topReferrers: topReferrers.map((row) => ({
      referrer: row.referrer,
      visits: Number(row.visits),
    })),
    activity,
    health,
  });
});

// ─── Users ──────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();
  const { page, limit, offset } = parsePagination(req);

  const filters = [];
  if (status && USER_STATUSES.includes(status as (typeof USER_STATUSES)[number])) {
    filters.push(eq(profilesTable.status, status));
  }
  if (q) {
    filters.push(
      or(
        ilike(profilesTable.name, `%${q}%`),
        ilike(profilesTable.email, `%${q}%`),
        ilike(profilesTable.targetRole, `%${q}%`),
        ilike(profilesTable.location, `%${q}%`),
      ),
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(profilesTable).where(where);
  const users = await db
    .select()
    .from(profilesTable)
    .where(where)
    .orderBy(desc(profilesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const emails = users.map((u) => u.email).filter(Boolean);
  const diagnosticCounts =
    emails.length > 0
      ? await db
          .select({
            email: diagnosticReportsTable.profileEmail,
            value: count(),
          })
          .from(diagnosticReportsTable)
          .where(inArray(diagnosticReportsTable.profileEmail, emails))
          .groupBy(diagnosticReportsTable.profileEmail)
      : [];
  const coachingApps =
    emails.length > 0
      ? await db
          .select()
          .from(coachingApplicationsTable)
          .where(inArray(coachingApplicationsTable.email, emails))
          .orderBy(desc(coachingApplicationsTable.createdAt))
      : [];

  const diagMap = new Map(
    diagnosticCounts.map((row) => [row.email || "", Number(row.value)]),
  );
  const coachingMap = new Map<string, string>();
  for (const app of coachingApps) {
    const key = app.email.toLowerCase();
    if (!coachingMap.has(key)) {
      coachingMap.set(key, normalizeCoachingStatus(app.status));
    }
  }

  const profileIds = users.map((u) => u.id);
  const subscriptions =
    profileIds.length > 0
      ? await db
          .select()
          .from(subscriptionsTable)
          .where(
            and(
              inArray(subscriptionsTable.profileId, profileIds),
              eq(subscriptionsTable.status, "active"),
            ),
          )
      : [];
  const programmes =
    profileIds.length > 0
      ? await db
          .select()
          .from(programmesTable)
          .where(inArray(programmesTable.profileId, profileIds))
          .orderBy(desc(programmesTable.createdAt))
      : [];

  const planMap = new Map<number, string>();
  for (const sub of subscriptions) {
    if (!planMap.has(sub.profileId)) planMap.set(sub.profileId, sub.plan);
  }
  const programmeMap = new Map<
    number,
    { status: string; daysRemaining: number; endDate: string | null }
  >();
  const now = new Date();
  for (const prog of programmes) {
    if (programmeMap.has(prog.profileId)) continue;
    const active = prog.status === "active" && prog.endDate.getTime() > now.getTime();
    programmeMap.set(prog.profileId, {
      status: active ? "active" : prog.status,
      daysRemaining: active ? daysBetween(now, prog.endDate) : 0,
      endDate: prog.endDate.toISOString(),
    });
  }

  res.json({
    users: users.map((user) => {
      const programme = programmeMap.get(user.id) || null;
      const plan =
        programme?.status === "active" ? "career_pro" : planMap.get(user.id) || "free";
      return {
        ...stripPassword(user),
        diagnosticCount: diagMap.get(user.email) || 0,
        coachingStatus: coachingMap.get(user.email.toLowerCase()) || null,
        plan,
        programmeStatus: programme?.status || null,
        programmeDaysRemaining: programme?.daysRemaining ?? null,
      };
    }),
    total: Number(totalRow?.value || 0),
    page,
    limit,
  });
});

router.get("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [user] = await db.select().from(profilesTable).where(eq(profilesTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const diagnostics = await db
    .select()
    .from(diagnosticReportsTable)
    .where(eq(diagnosticReportsTable.profileEmail, user.email))
    .orderBy(desc(diagnosticReportsTable.createdAt));
  const coaching = await db
    .select()
    .from(coachingApplicationsTable)
    .where(eq(coachingApplicationsTable.email, user.email))
    .orderBy(desc(coachingApplicationsTable.createdAt));

  const entitlement = await resolveEntitlement(user.id);

  res.json({
    user: {
      ...stripPassword(user),
      plan: entitlement.plan,
      planName: entitlement.planName,
      accessLevel: entitlement.accessLevel,
      programmeStatus: entitlement.programme?.status || null,
      programmeDaysRemaining: entitlement.programme?.daysRemaining ?? null,
      programmeEndDate: entitlement.programme?.endDate || null,
      features: entitlement.features,
    },
    diagnostics,
    coaching: coaching.map(normalizeCoachingRow),
    entitlement,
  });
});

router.patch(
  "/admin/users/:id",
  requireAdmin,
  requirePermission("manage_users"),
  async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updates: Partial<typeof profilesTable.$inferInsert> = {};
    if (req.body?.name != null) updates.name = String(req.body.name).trim();
    if (req.body?.phone != null) updates.phone = String(req.body.phone).trim() || null;
    if (req.body?.location != null) updates.location = String(req.body.location).trim() || null;
    if (req.body?.targetRole != null) {
      updates.targetRole = String(req.body.targetRole).trim() || null;
    }
    if (req.body?.status != null) {
      const status = String(req.body.status).trim().toLowerCase();
      if (!USER_STATUSES.includes(status as (typeof USER_STATUSES)[number])) {
        res.status(400).json({ error: "Status must be active or inactive" });
        return;
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      res.json({ user: stripPassword(existing) });
      return;
    }

    const [updated] = await db
      .update(profilesTable)
      .set(updates)
      .where(eq(profilesTable.id, id))
      .returning();

    await writeAuditLog({
      admin: actorFromReq(req),
      action: "update",
      entityType: "user",
      entityId: id,
      summary: `Updated user ${updated.email}`,
      metadata: updates,
    });

    res.json({ user: stripPassword(updated) });
  },
);

router.delete(
  "/admin/users/:id",
  requireAdmin,
  requirePermission("manage_users"),
  async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (req.body?.confirm === false) {
      res.status(400).json({ error: "Deletion not confirmed" });
      return;
    }
    const [existing] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await db.delete(profilesTable).where(eq(profilesTable.id, id));
    await writeAuditLog({
      admin: actorFromReq(req),
      action: "delete",
      entityType: "user",
      entityId: id,
      summary: `Deleted user ${existing.email}`,
    });
    res.json({ ok: true });
  },
);

router.post(
  "/admin/users/bulk",
  requireAdmin,
  requirePermission("manage_users"),
  async (req, res) => {
    const ids = parseIdList(req.body?.ids);
    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!ids.length || !["activate", "deactivate", "delete"].includes(action)) {
      res.status(400).json({ error: "Provide ids and action: activate|deactivate|delete" });
      return;
    }

    const actor = actorFromReq(req);
    if (action === "delete") {
      await db.delete(profilesTable).where(inArray(profilesTable.id, ids));
      await writeAuditLog({
        admin: actor,
        action: "bulk_delete",
        entityType: "user",
        summary: `Bulk deleted ${ids.length} users`,
        metadata: { ids },
      });
    } else {
      const status = action === "activate" ? "active" : "inactive";
      await db
        .update(profilesTable)
        .set({ status })
        .where(inArray(profilesTable.id, ids));
      await writeAuditLog({
        admin: actor,
        action: "bulk_update",
        entityType: "user",
        summary: `Bulk ${action}d ${ids.length} users`,
        metadata: { ids, status },
      });
    }
    res.json({ ok: true, count: ids.length });
  },
);

// ─── Diagnostics ────────────────────────────────────────────────────────────

router.get("/admin/diagnostics", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const { page, limit, offset } = parsePagination(req);

  const filters = [];
  if (q) {
    filters.push(
      or(
        ilike(diagnosticReportsTable.fileName, `%${q}%`),
        ilike(diagnosticReportsTable.profileEmail, `%${q}%`),
        ilike(diagnosticReportsTable.targetRole, `%${q}%`),
      ),
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(diagnosticReportsTable)
    .where(where);
  const reports = await db
    .select()
    .from(diagnosticReportsTable)
    .where(where)
    .orderBy(desc(diagnosticReportsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    reports,
    total: Number(totalRow?.value || 0),
    page,
    limit,
  });
});

router.get("/admin/diagnostics/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid diagnostic id" });
    return;
  }
  const [report] = await db
    .select()
    .from(diagnosticReportsTable)
    .where(eq(diagnosticReportsTable.id, id))
    .limit(1);
  if (!report) {
    res.status(404).json({ error: "Diagnostic report not found" });
    return;
  }
  res.json({ report });
});

router.delete(
  "/admin/diagnostics/:id",
  requireAdmin,
  requirePermission("manage_diagnostics"),
  async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid diagnostic id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(diagnosticReportsTable)
      .where(eq(diagnosticReportsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Diagnostic report not found" });
      return;
    }
    await db.delete(diagnosticReportsTable).where(eq(diagnosticReportsTable.id, id));
    await writeAuditLog({
      admin: actorFromReq(req),
      action: "delete",
      entityType: "diagnostic",
      entityId: id,
      summary: `Deleted CV review ${existing.fileName}`,
    });
    res.json({ ok: true });
  },
);

router.post(
  "/admin/diagnostics/bulk-delete",
  requireAdmin,
  requirePermission("manage_diagnostics"),
  async (req, res) => {
    const ids = parseIdList(req.body?.ids);
    if (!ids.length) {
      res.status(400).json({ error: "Provide ids to delete" });
      return;
    }
    await db.delete(diagnosticReportsTable).where(inArray(diagnosticReportsTable.id, ids));
    await writeAuditLog({
      admin: actorFromReq(req),
      action: "bulk_delete",
      entityType: "diagnostic",
      summary: `Bulk deleted ${ids.length} diagnostic reports`,
      metadata: { ids },
    });
    res.json({ ok: true, count: ids.length });
  },
);

// ─── Coaching ───────────────────────────────────────────────────────────────

router.get("/admin/coaching", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();
  const { page, limit, offset } = parsePagination(req);

  const filters = [];
  if (status) {
    if (status === "pending") {
      filters.push(isPendingCoachingStatus());
    } else {
      filters.push(eq(coachingApplicationsTable.status, status));
    }
  }
  if (q) {
    filters.push(
      or(
        ilike(coachingApplicationsTable.name, `%${q}%`),
        ilike(coachingApplicationsTable.email, `%${q}%`),
        ilike(coachingApplicationsTable.paymentPlan, `%${q}%`),
        ilike(coachingApplicationsTable.goals, `%${q}%`),
      ),
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(coachingApplicationsTable)
    .where(where);
  const applications = await db
    .select()
    .from(coachingApplicationsTable)
    .where(where)
    .orderBy(desc(coachingApplicationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    applications: applications.map(normalizeCoachingRow),
    total: Number(totalRow?.value || 0),
    page,
    limit,
  });
});

router.get("/admin/coaching/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid coaching id" });
    return;
  }
  const [application] = await db
    .select()
    .from(coachingApplicationsTable)
    .where(eq(coachingApplicationsTable.id, id))
    .limit(1);
  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.json({ application: normalizeCoachingRow(application) });
});

router.patch(
  "/admin/coaching/:id",
  requireAdmin,
  requirePermission("manage_coaching"),
  async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid coaching id" });
      return;
    }

    const updates: Partial<typeof coachingApplicationsTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (req.body?.status != null) {
      const status = String(req.body.status).trim().toLowerCase();
      if (!COACHING_STATUSES.includes(status as (typeof COACHING_STATUSES)[number])) {
        res.status(400).json({ error: "Invalid coaching status" });
        return;
      }
      updates.status = status;
    }
    if (req.body?.priority != null) {
      const priority = String(req.body.priority).trim().toLowerCase();
      if (!COACHING_PRIORITIES.includes(priority as (typeof COACHING_PRIORITIES)[number])) {
        res.status(400).json({ error: "Invalid priority" });
        return;
      }
      updates.priority = priority;
    }
    if (req.body?.assignedCoach != null) {
      updates.assignedCoach = String(req.body.assignedCoach).trim() || null;
    }
    if (req.body?.internalNotes != null) {
      updates.internalNotes = String(req.body.internalNotes);
    }
    if (req.body?.scheduledAt != null) {
      updates.scheduledAt = String(req.body.scheduledAt).trim() || null;
    }

    const [updated] = await db
      .update(coachingApplicationsTable)
      .set(updates)
      .where(eq(coachingApplicationsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Application not found" });
      return;
    }

    await writeAuditLog({
      admin: actorFromReq(req),
      action: "update",
      entityType: "coaching",
      entityId: id,
      summary: `Updated coaching application for ${updated.name}`,
      metadata: updates,
    });

    res.json({ application: normalizeCoachingRow(updated) });
  },
);

router.delete(
  "/admin/coaching/:id",
  requireAdmin,
  requirePermission("manage_coaching"),
  async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid coaching id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(coachingApplicationsTable)
      .where(eq(coachingApplicationsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    await db.delete(coachingApplicationsTable).where(eq(coachingApplicationsTable.id, id));
    await writeAuditLog({
      admin: actorFromReq(req),
      action: "delete",
      entityType: "coaching",
      entityId: id,
      summary: `Deleted coaching application for ${existing.name}`,
    });
    res.json({ ok: true });
  },
);

router.post(
  "/admin/coaching/bulk-status",
  requireAdmin,
  requirePermission("manage_coaching"),
  async (req, res) => {
    const ids = parseIdList(req.body?.ids);
    const status = String(req.body?.status || "")
      .trim()
      .toLowerCase();
    if (!ids.length || !COACHING_STATUSES.includes(status as (typeof COACHING_STATUSES)[number])) {
      res.status(400).json({ error: "Provide ids and a valid status" });
      return;
    }
    await db
      .update(coachingApplicationsTable)
      .set({ status, updatedAt: new Date() })
      .where(inArray(coachingApplicationsTable.id, ids));
    await writeAuditLog({
      admin: actorFromReq(req),
      action: "bulk_update",
      entityType: "coaching",
      summary: `Bulk set ${ids.length} coaching applications to ${status}`,
      metadata: { ids, status },
    });
    res.json({ ok: true, count: ids.length });
  },
);

// ─── Jobs ───────────────────────────────────────────────────────────────────

router.get("/admin/jobs", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();
  const { page, limit, offset } = parsePagination(req);

  const filters = [];
  if (status) filters.push(eq(jobsTable.status, status));
  if (q) {
    filters.push(
      or(
        ilike(jobsTable.title, `%${q}%`),
        ilike(jobsTable.company, `%${q}%`),
        ilike(jobsTable.location, `%${q}%`),
        ilike(jobsTable.sector, `%${q}%`),
      ),
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(jobsTable).where(where);
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(where)
    .orderBy(desc(jobsTable.updatedAt))
    .limit(limit)
    .offset(offset);

  res.json({
    jobs,
    total: Number(totalRow?.value || 0),
    page,
    limit,
  });
});

router.get("/admin/jobs/:id", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({ job });
});

router.post(
  "/admin/jobs",
  requireAdmin,
  requirePermission("manage_jobs"),
  async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const company = String(req.body?.company || "").trim();
    const location = String(req.body?.location || "").trim();
    const sector = String(req.body?.sector || "").trim();
    const salary = String(req.body?.salary || "").trim();

    if (!title || !company || !location || !sector || !salary) {
      res.status(400).json({
        error: "title, company, location, sector, and salary are required",
      });
      return;
    }

    const statusRaw = String(req.body?.status || "draft")
      .trim()
      .toLowerCase();
    const status = JOB_STATUSES.includes(statusRaw as (typeof JOB_STATUSES)[number])
      ? statusRaw
      : "draft";

    const tags = parseTags(req.body?.tags);
    const match =
      req.body?.match != null && Number.isFinite(Number(req.body.match))
        ? Number(req.body.match)
        : 80;

    const [created] = await db
      .insert(jobsTable)
      .values({
        title,
        company,
        location,
        sector,
        salary,
        match,
        posted: String(req.body?.posted || "Recently").trim() || "Recently",
        tags,
        description: req.body?.description != null ? String(req.body.description) : null,
        requirements: req.body?.requirements != null ? String(req.body.requirements) : null,
        applicationUrl:
          req.body?.applicationUrl != null ? String(req.body.applicationUrl).trim() || null : null,
        employmentType: String(req.body?.employmentType || "Full-time").trim() || "Full-time",
        workMode: String(req.body?.workMode || "hybrid").trim() || "hybrid",
        status,
        closingDate:
          req.body?.closingDate != null ? String(req.body.closingDate).trim() || null : null,
      })
      .returning();

    await writeAuditLog({
      admin: actorFromReq(req),
      action: "create",
      entityType: "job",
      entityId: created.id,
      summary: `Created job ${created.title}`,
    });

    res.status(201).json({ job: created });
  },
);

router.patch(
  "/admin/jobs/:id",
  requireAdmin,
  requirePermission("manage_jobs"),
  async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }

    const updates: Partial<typeof jobsTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (req.body?.title != null) updates.title = String(req.body.title).trim();
    if (req.body?.company != null) updates.company = String(req.body.company).trim();
    if (req.body?.location != null) updates.location = String(req.body.location).trim();
    if (req.body?.sector != null) updates.sector = String(req.body.sector).trim();
    if (req.body?.salary != null) updates.salary = String(req.body.salary).trim();
    if (req.body?.posted != null) {
      updates.posted = String(req.body.posted).trim() || "Recently";
    }
    if (req.body?.description != null) {
      updates.description = String(req.body.description).trim() || null;
    }
    if (req.body?.requirements != null) {
      updates.requirements = String(req.body.requirements).trim() || null;
    }
    if (req.body?.applicationUrl != null) {
      updates.applicationUrl = String(req.body.applicationUrl).trim() || null;
    }
    if (req.body?.employmentType != null) {
      updates.employmentType = String(req.body.employmentType).trim() || "Full-time";
    }
    if (req.body?.workMode != null) {
      updates.workMode = String(req.body.workMode).trim() || "hybrid";
    }
    if (req.body?.closingDate != null) {
      updates.closingDate = String(req.body.closingDate).trim() || null;
    }

    if (req.body?.tags != null) updates.tags = parseTags(req.body.tags);
    if (req.body?.match != null && Number.isFinite(Number(req.body.match))) {
      updates.match = Number(req.body.match);
    }
    if (req.body?.status != null) {
      const status = String(req.body.status).trim().toLowerCase();
      if (!JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number])) {
        res.status(400).json({ error: "Invalid job status" });
        return;
      }
      updates.status = status;
    }

    const [updated] = await db
      .update(jobsTable)
      .set(updates)
      .where(eq(jobsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    await writeAuditLog({
      admin: actorFromReq(req),
      action: "update",
      entityType: "job",
      entityId: id,
      summary: `Updated job ${updated.title}`,
      metadata: updates,
    });

    res.json({ job: updated });
  },
);

router.delete(
  "/admin/jobs/:id",
  requireAdmin,
  requirePermission("manage_jobs"),
  async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }
    const [existing] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    await db.delete(jobsTable).where(eq(jobsTable.id, id));
    await writeAuditLog({
      admin: actorFromReq(req),
      action: "delete",
      entityType: "job",
      entityId: id,
      summary: `Deleted job ${existing.title}`,
    });
    res.json({ ok: true });
  },
);

router.post(
  "/admin/jobs/bulk",
  requireAdmin,
  requirePermission("manage_jobs"),
  async (req, res) => {
    const ids = parseIdList(req.body?.ids);
    const action = String(req.body?.action || "")
      .trim()
      .toLowerCase();
    if (!ids.length || !["publish", "unpublish", "archive", "delete"].includes(action)) {
      res.status(400).json({
        error: "Provide ids and action: publish|unpublish|archive|delete",
      });
      return;
    }

    const actor = actorFromReq(req);
    if (action === "delete") {
      await db.delete(jobsTable).where(inArray(jobsTable.id, ids));
      await writeAuditLog({
        admin: actor,
        action: "bulk_delete",
        entityType: "job",
        summary: `Bulk deleted ${ids.length} jobs`,
        metadata: { ids },
      });
    } else {
      const status =
        action === "publish" ? "published" : action === "archive" ? "archived" : "draft";
      await db
        .update(jobsTable)
        .set({ status, updatedAt: new Date() })
        .where(inArray(jobsTable.id, ids));
      await writeAuditLog({
        admin: actor,
        action: "bulk_update",
        entityType: "job",
        summary: `Bulk ${action} ${ids.length} jobs`,
        metadata: { ids, status },
      });
    }
    res.json({ ok: true, count: ids.length });
  },
);

// ─── Traffic ────────────────────────────────────────────────────────────────

router.get("/admin/traffic", requireAdmin, async (req, res) => {
  const range = parseRange(req.query.range, req.query.from, req.query.to);
  const visitFilter = rangeConditions(siteVisitsTable.createdAt, range);
  const profileFilter = rangeConditions(profilesTable.createdAt, range);
  const diagnosticFilter = rangeConditions(diagnosticReportsTable.createdAt, range);
  const coachingFilter = rangeConditions(coachingApplicationsTable.createdAt, range);
  const { page, limit, offset } = parsePagination(req, 50);

  const [
    visitRows,
    uniqueVisitorRows,
    pageViewRows,
    visitsByDay,
    topPaths,
    topReferrers,
    allVisitsForUa,
    visitorCounts,
    registrations,
    cvReviews,
    coaching,
    totalVisitsRow,
    visitsPage,
  ] = await Promise.all([
    db.select({ value: count() }).from(siteVisitsTable).where(visitFilter),
    db
      .select({ value: sql<number>`count(distinct ${siteVisitsTable.visitorId})` })
      .from(siteVisitsTable)
      .where(visitFilter),
    db.select({ value: count() }).from(siteVisitsTable).where(visitFilter),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${siteVisitsTable.createdAt}), 'YYYY-MM-DD')`,
        visits: count(),
      })
      .from(siteVisitsTable)
      .where(visitFilter ?? gte(siteVisitsTable.createdAt, daysAgo(30)))
      .groupBy(sql`date_trunc('day', ${siteVisitsTable.createdAt})`)
      .orderBy(sql`date_trunc('day', ${siteVisitsTable.createdAt})`),
    db
      .select({ path: siteVisitsTable.path, visits: count() })
      .from(siteVisitsTable)
      .where(visitFilter)
      .groupBy(siteVisitsTable.path)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({
        referrer: sql<string>`coalesce(${siteVisitsTable.referrer}, 'direct')`,
        visits: count(),
      })
      .from(siteVisitsTable)
      .where(visitFilter)
      .groupBy(sql`coalesce(${siteVisitsTable.referrer}, 'direct')`)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({ userAgent: siteVisitsTable.userAgent })
      .from(siteVisitsTable)
      .where(visitFilter)
      .limit(5000),
    db
      .select({
        visitorId: siteVisitsTable.visitorId,
        visits: count(),
      })
      .from(siteVisitsTable)
      .where(visitFilter)
      .groupBy(siteVisitsTable.visitorId),
    db.select({ value: count() }).from(profilesTable).where(profileFilter),
    db.select({ value: count() }).from(diagnosticReportsTable).where(diagnosticFilter),
    db.select({ value: count() }).from(coachingApplicationsTable).where(coachingFilter),
    db.select({ value: count() }).from(siteVisitsTable).where(visitFilter),
    db
      .select()
      .from(siteVisitsTable)
      .where(visitFilter)
      .orderBy(desc(siteVisitsTable.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const devices = { desktop: 0, mobile: 0, tablet: 0, other: 0 };
  const browsers = { chrome: 0, firefox: 0, safari: 0, edge: 0, other: 0 };
  for (const row of allVisitsForUa) {
    const parsed = parseUserAgent(row.userAgent);
    devices[parsed.device] += 1;
    browsers[parsed.browser] += 1;
  }

  let newVisitors = 0;
  let returningVisitors = 0;
  for (const row of visitorCounts) {
    if (Number(row.visits) > 1) returningVisitors += 1;
    else newVisitors += 1;
  }

  res.json({
    range: range.label,
    totals: {
      visits: Number(visitRows[0]?.value || 0),
      uniqueVisitors: Number(uniqueVisitorRows[0]?.value || 0),
      pageViews: Number(pageViewRows[0]?.value || 0),
    },
    visitsByDay: visitsByDay.map((row) => ({
      day: row.day,
      visits: Number(row.visits),
    })),
    topPaths: topPaths.map((row) => ({
      path: row.path,
      visits: Number(row.visits),
    })),
    topReferrers: topReferrers.map((row) => ({
      referrer: row.referrer,
      visits: Number(row.visits),
    })),
    devices,
    browsers,
    newVsReturning: {
      new: newVisitors,
      returning: returningVisitors,
    },
    conversions: {
      registrations: Number(registrations[0]?.value || 0),
      cvReviews: Number(cvReviews[0]?.value || 0),
      coaching: Number(coaching[0]?.value || 0),
    },
    visits: visitsPage,
    total: Number(totalVisitsRow[0]?.value || 0),
    page,
    limit,
  });
});

// ─── Visits ─────────────────────────────────────────────────────────────────

router.get("/admin/visits", requireAdmin, async (req, res) => {
  const range = parseRange(req.query.range, req.query.from, req.query.to);
  const pathFilter = String(req.query.path || "").trim();
  const { page, limit, offset } = parsePagination(req, 50);

  const filters = [];
  const rangeFilter = rangeConditions(siteVisitsTable.createdAt, range);
  if (rangeFilter) filters.push(rangeFilter);
  if (pathFilter) filters.push(ilike(siteVisitsTable.path, `%${pathFilter}%`));
  const where = filters.length ? and(...filters) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(siteVisitsTable).where(where);
  const visits = await db
    .select()
    .from(siteVisitsTable)
    .where(where)
    .orderBy(desc(siteVisitsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    visits,
    total: Number(totalRow?.value || 0),
    page,
    limit,
    range: range.label,
  });
});

// ─── Audit ──────────────────────────────────────────────────────────────────

router.get("/admin/audit", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const { page, limit, offset } = parsePagination(req, 50);

  const all = await listAuditLogs({ q, limit: 500 });
  const total = all.length;
  const logs = all.slice(offset, offset + limit);

  res.json({ logs, total, page, limit });
});

// ─── Notifications ──────────────────────────────────────────────────────────

router.get("/admin/notifications", requireAdmin, async (_req, res) => {
  const notifications = await listNotifications({ limit: 100 });
  res.json({ notifications });
});

router.post("/admin/notifications/read-all", requireAdmin, async (_req, res) => {
  await markAllNotificationsRead();
  res.json({ ok: true });
});

router.post("/admin/notifications/:id/read", requireAdmin, async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }
  const updated = await markNotificationRead(id);
  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json({ notification: updated });
});

// ─── Search ─────────────────────────────────────────────────────────────────

router.get("/admin/search", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.json({ users: [], diagnostics: [], coaching: [], jobs: [], admins: [] });
    return;
  }
  const pattern = `%${q}%`;

  const [users, diagnostics, coaching, jobs, admins] = await Promise.all([
    db
      .select()
      .from(profilesTable)
      .where(
        or(
          ilike(profilesTable.name, pattern),
          ilike(profilesTable.email, pattern),
          ilike(profilesTable.targetRole, pattern),
        ),
      )
      .orderBy(desc(profilesTable.createdAt))
      .limit(8),
    db
      .select()
      .from(diagnosticReportsTable)
      .where(
        or(
          ilike(diagnosticReportsTable.fileName, pattern),
          ilike(diagnosticReportsTable.profileEmail, pattern),
          ilike(diagnosticReportsTable.targetRole, pattern),
        ),
      )
      .orderBy(desc(diagnosticReportsTable.createdAt))
      .limit(8),
    db
      .select()
      .from(coachingApplicationsTable)
      .where(
        or(
          ilike(coachingApplicationsTable.name, pattern),
          ilike(coachingApplicationsTable.email, pattern),
          ilike(coachingApplicationsTable.goals, pattern),
        ),
      )
      .orderBy(desc(coachingApplicationsTable.createdAt))
      .limit(8),
    db
      .select()
      .from(jobsTable)
      .where(
        or(
          ilike(jobsTable.title, pattern),
          ilike(jobsTable.company, pattern),
          ilike(jobsTable.location, pattern),
          ilike(jobsTable.sector, pattern),
        ),
      )
      .orderBy(desc(jobsTable.updatedAt))
      .limit(8),
    db
      .select()
      .from(adminUsersTable)
      .where(
        or(ilike(adminUsersTable.name, pattern), ilike(adminUsersTable.email, pattern)),
      )
      .orderBy(asc(adminUsersTable.name))
      .limit(8),
  ]);

  res.json({
    users: users.map(stripPassword),
    diagnostics,
    coaching: coaching.map(normalizeCoachingRow),
    jobs,
    admins: admins.map(toPublicAdmin),
  });
});

// ─── Settings ───────────────────────────────────────────────────────────────

router.get("/admin/settings", requireAdmin, async (_req, res) => {
  const settings = await getPlatformSettings();
  res.json({ settings });
});

router.put(
  "/admin/settings",
  requireAdmin,
  requirePermission("manage_settings"),
  async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key === "settings" && value && typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          patch[k] = String(v);
        }
      } else {
        patch[key] = String(value);
      }
    }

    const actor = actorFromReq(req);
    const settings = await updatePlatformSettings(patch, actor.email);
    await writeAuditLog({
      admin: actor,
      action: "update",
      entityType: "settings",
      summary: "Updated platform settings",
      metadata: patch,
    });
    res.json({ settings });
  },
);

// ─── Health ─────────────────────────────────────────────────────────────────

router.get("/admin/health", requireAdmin, async (_req, res) => {
  const health = await liveHealth();
  res.json(health);
});

// ─── Export ─────────────────────────────────────────────────────────────────

router.get("/admin/export/:entity", requireAdmin, async (req, res) => {
  const entity = String(req.params.entity || "")
    .trim()
    .toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);

  if (entity === "users") {
    const rows = await db.select().from(profilesTable).orderBy(desc(profilesTable.createdAt));
    res.json({
      rows: rows.map(stripPassword),
      filename: `users-${stamp}.json`,
    });
    return;
  }
  if (entity === "diagnostics") {
    const rows = await db
      .select()
      .from(diagnosticReportsTable)
      .orderBy(desc(diagnosticReportsTable.createdAt));
    res.json({ rows, filename: `diagnostics-${stamp}.json` });
    return;
  }
  if (entity === "coaching") {
    const rows = await db
      .select()
      .from(coachingApplicationsTable)
      .orderBy(desc(coachingApplicationsTable.createdAt));
    res.json({
      rows: rows.map(normalizeCoachingRow),
      filename: `coaching-${stamp}.json`,
    });
    return;
  }
  if (entity === "jobs") {
    const rows = await db.select().from(jobsTable).orderBy(desc(jobsTable.updatedAt));
    res.json({ rows, filename: `jobs-${stamp}.json` });
    return;
  }
  if (entity === "visits") {
    const rows = await db
      .select()
      .from(siteVisitsTable)
      .orderBy(desc(siteVisitsTable.createdAt))
      .limit(5000);
    res.json({ rows, filename: `visits-${stamp}.json` });
    return;
  }
  if (entity === "audit") {
    const rows = await listAuditLogs({ limit: 500 });
    res.json({ rows, filename: `audit-${stamp}.json` });
    return;
  }

  res.status(400).json({
    error: "entity must be one of: users, diagnostics, coaching, jobs, visits, audit",
  });
});

// ─── Analytics ──────────────────────────────────────────────────────────────

router.post("/analytics/visit", async (req, res) => {
  const pathName = String(req.body?.path || "/").slice(0, 240);
  if (pathName.startsWith("/admin")) {
    res.status(204).end();
    return;
  }
  const visitorId = String(req.body?.visitorId || "anonymous").slice(0, 120);
  const referrer = req.body?.referrer ? String(req.body.referrer).slice(0, 400) : null;
  const userAgent = (req.header("user-agent") || "").slice(0, 300);

  await db.insert(siteVisitsTable).values({
    path: pathName,
    referrer,
    visitorId,
    userAgent,
  });
  res.status(204).end();
});

export default router;
