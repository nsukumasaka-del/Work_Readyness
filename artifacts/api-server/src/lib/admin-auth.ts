import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, count, eq, gt } from "drizzle-orm";
import { adminSessionsTable, adminUsersTable, db, profilesTable } from "@workspace/db";
import { hashPassword, verifyPassword } from "./user-auth";

const SESSION_DAYS = 7;
export const MAX_ADMINS = 4;

export const ADMIN_ROLES = ["super_admin", "admin", "moderator", "content_manager"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminPermission =
  | "manage_admins"
  | "manage_users"
  | "manage_coaching"
  | "manage_diagnostics"
  | "manage_jobs"
  | "manage_settings"
  | "view_audit"
  | "view_traffic"
  | "view_overview";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    "manage_admins",
    "manage_users",
    "manage_coaching",
    "manage_diagnostics",
    "manage_jobs",
    "manage_settings",
    "view_audit",
    "view_traffic",
    "view_overview",
  ],
  admin: [
    "manage_users",
    "manage_coaching",
    "manage_diagnostics",
    "manage_jobs",
    "manage_settings",
    "view_audit",
    "view_traffic",
    "view_overview",
  ],
  moderator: [
    "manage_users",
    "manage_coaching",
    "manage_diagnostics",
    "view_traffic",
    "view_overview",
  ],
  content_manager: ["manage_jobs", "view_traffic", "view_overview"],
};

export type AuthedAdmin = typeof adminUsersTable.$inferSelect;

export type AuthedRequest = Request & { adminUser?: AuthedAdmin };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getPrimaryAdminConfig() {
  return {
    name: process.env.PRIMARY_ADMIN_NAME || "Ntokozo Sukumasaka",
    email: (process.env.PRIMARY_ADMIN_EMAIL || "nsukumasaka@gmail.com").toLowerCase().trim(),
    password: process.env.PRIMARY_ADMIN_PASSWORD || "Bohlale.99",
  };
}

export function normalizeAdminRole(admin: AuthedAdmin | null | undefined): AdminRole {
  if (!admin) return "admin";
  if (admin.isPrimary) return "super_admin";
  const role = String(admin.role || "admin") as AdminRole;
  return ADMIN_ROLES.includes(role) ? role : "admin";
}

export function adminHasPermission(admin: AuthedAdmin | null | undefined, permission: AdminPermission) {
  const role = normalizeAdminRole(admin);
  return ROLE_PERMISSIONS[role].includes(permission);
}

let primaryAdminReady = false;

export async function ensurePrimaryAdmin(): Promise<void> {
  if (primaryAdminReady) return;

  const primary = getPrimaryAdminConfig();
  const [existing] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, primary.email))
    .limit(1);

  let passwordHash = existing?.passwordHash;
  const passwordMatches = passwordHash ? verifyPassword(primary.password, passwordHash) : false;
  if (!passwordMatches) {
    passwordHash = hashPassword(primary.password);
  }

  if (!existing) {
    await db.insert(adminUsersTable).values({
      name: primary.name,
      email: primary.email,
      passwordHash: passwordHash!,
      isPrimary: 1,
      role: "super_admin",
      status: "active",
    });
  } else {
    const updates: Partial<typeof adminUsersTable.$inferInsert> = {
      isPrimary: 1,
      role: "super_admin",
      status: existing.status || "active",
    };
    if (!existing.name) updates.name = primary.name;
    if (!passwordMatches) updates.passwordHash = passwordHash!;
    await db.update(adminUsersTable).set(updates).where(eq(adminUsersTable.id, existing.id));
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.email, primary.email))
    .limit(1);

  if (!profile) {
    await db.insert(profilesTable).values({
      name: primary.name,
      email: primary.email,
      passwordHash: passwordHash!,
      status: "active",
    });
  } else {
    const profileMatches = verifyPassword(primary.password, profile.passwordHash);
    const profileUpdates: Partial<typeof profilesTable.$inferInsert> = {
      status: profile.status || "active",
    };
    if (!profile.name) profileUpdates.name = primary.name;
    if (!profileMatches) profileUpdates.passwordHash = passwordHash!;
    await db.update(profilesTable).set(profileUpdates).where(eq(profilesTable.id, profile.id));
  }

  primaryAdminReady = true;
}

export async function findAdminByEmail(email: string) {
  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email.toLowerCase().trim()))
    .limit(1);
  return admin ?? null;
}

export async function authenticateAdmin(email: string, password: string) {
  const admin = await findAdminByEmail(email);
  if (!admin || !verifyPassword(password, admin.passwordHash)) return null;
  if (admin.status && admin.status !== "active") return null;
  return admin;
}

export async function createAdminSession(adminUserId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(adminSessionsTable).values({
    token: hashToken(token),
    adminUserId,
    expiresAt,
  });
  await db
    .update(adminUsersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsersTable.id, adminUserId));
  return { token, expiresAt };
}

export async function revokeAdminSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.token, hashToken(token)));
}

export async function getAdminFromToken(token: string | undefined) {
  if (!token) return null;
  const [session] = await db
    .select()
    .from(adminSessionsTable)
    .where(
      and(eq(adminSessionsTable.token, hashToken(token)), gt(adminSessionsTable.expiresAt, new Date())),
    )
    .limit(1);
  if (!session?.adminUserId) return null;
  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, session.adminUserId))
    .limit(1);
  if (!admin || (admin.status && admin.status !== "active")) return null;
  return admin;
}

export async function isValidAdminToken(token: string | undefined): Promise<boolean> {
  return Boolean(await getAdminFromToken(token));
}

export function getBearerToken(req: Request): string | undefined {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

export function getRequestAdmin(req: Request): AuthedAdmin | undefined {
  return (req as AuthedRequest).adminUser;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  const admin = await getAdminFromToken(token);
  if (!admin) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  (req as AuthedRequest).adminUser = admin;
  next();
}

export function requirePermission(permission: AdminPermission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = getRequestAdmin(req);
    if (!adminHasPermission(admin, permission)) {
      res.status(403).json({ error: "You do not have permission for this action" });
      return;
    }
    next();
  };
}

export async function listAdmins() {
  return db.select().from(adminUsersTable);
}

export async function countAdmins() {
  const [row] = await db.select({ value: count() }).from(adminUsersTable);
  return Number(row?.value || 0);
}

export async function addAdmin(input: {
  name: string;
  email: string;
  password: string;
  role?: AdminRole;
}) {
  const total = await countAdmins();
  if (total >= MAX_ADMINS) {
    throw new Error(`A maximum of ${MAX_ADMINS} administrators is allowed`);
  }
  const email = input.email.toLowerCase().trim();
  const existing = await findAdminByEmail(email);
  if (existing) throw new Error("An admin with this email already exists");

  const role: AdminRole =
    input.role && ADMIN_ROLES.includes(input.role) && input.role !== "super_admin"
      ? input.role
      : "admin";

  const passwordHash = hashPassword(input.password);
  const [created] = await db
    .insert(adminUsersTable)
    .values({
      name: input.name.trim(),
      email,
      passwordHash,
      isPrimary: 0,
      role,
      status: "active",
    })
    .returning();

  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);
  if (!profile) {
    await db.insert(profilesTable).values({
      name: input.name.trim(),
      email,
      passwordHash,
      status: "active",
    });
  } else {
    await db
      .update(profilesTable)
      .set({ passwordHash, name: input.name.trim() })
      .where(eq(profilesTable.id, profile.id));
  }

  return created;
}

export async function updateAdmin(
  id: number,
  input: { name?: string; role?: AdminRole; status?: string; password?: string },
) {
  const [target] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id)).limit(1);
  if (!target) throw new Error("Admin not found");
  if (target.isPrimary && input.role && input.role !== "super_admin") {
    throw new Error("The primary admin must remain a Super Admin");
  }
  if (target.isPrimary && input.status && input.status !== "active") {
    throw new Error("The primary admin cannot be deactivated");
  }

  const updates: Partial<typeof adminUsersTable.$inferInsert> = {};
  if (input.name?.trim()) updates.name = input.name.trim();
  if (input.role && ADMIN_ROLES.includes(input.role)) {
    updates.role = target.isPrimary ? "super_admin" : input.role === "super_admin" ? "admin" : input.role;
  }
  if (input.status && ["active", "inactive"].includes(input.status)) updates.status = input.status;
  if (input.password && input.password.length >= 6) updates.passwordHash = hashPassword(input.password);

  if (Object.keys(updates).length === 0) return target;
  const [updated] = await db.update(adminUsersTable).set(updates).where(eq(adminUsersTable.id, id)).returning();
  return updated;
}

export async function removeAdmin(id: number, requesterId: number) {
  const [target] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id)).limit(1);
  if (!target) throw new Error("Admin not found");
  if (target.isPrimary) throw new Error("The primary admin cannot be removed");
  if (target.id === requesterId) throw new Error("You cannot remove your own admin access");
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, id));
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
  return true;
}

export function toPublicAdmin(admin: AuthedAdmin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    isPrimary: Boolean(admin.isPrimary),
    role: normalizeAdminRole(admin),
    status: admin.status || "active",
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
  };
}
