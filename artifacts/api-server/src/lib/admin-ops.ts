import { desc, eq, isNull } from "drizzle-orm";
import {
  adminAuditLogTable,
  adminNotificationsTable,
  db,
  platformSettingsTable,
} from "@workspace/db";

export type AdminActor = {
  id?: number | null;
  email: string;
};

export async function writeAuditLog(input: {
  admin: AdminActor;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminAuditLogTable).values({
    adminUserId: input.admin.id ?? null,
    adminEmail: input.admin.email,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId == null ? null : String(input.entityId),
    summary: input.summary,
    metadata: JSON.stringify(input.metadata || {}),
  });
}

export async function createAdminNotification(input: {
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string | number | null;
}) {
  await db.insert(adminNotificationsTable).values({
    type: input.type,
    title: input.title,
    body: input.body,
    entityType: input.entityType || null,
    entityId: input.entityId == null ? null : String(input.entityId),
  });
}

export async function listAuditLogs(opts?: { q?: string; limit?: number }) {
  const limit = Math.min(Math.max(opts?.limit || 100, 1), 500);
  const rows = await db
    .select()
    .from(adminAuditLogTable)
    .orderBy(desc(adminAuditLogTable.createdAt))
    .limit(limit);
  const q = (opts?.q || "").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (row) =>
      row.action.toLowerCase().includes(q) ||
      row.summary.toLowerCase().includes(q) ||
      row.adminEmail.toLowerCase().includes(q) ||
      row.entityType.toLowerCase().includes(q) ||
      (row.entityId || "").toLowerCase().includes(q),
  );
}

export async function listNotifications(opts?: { unreadOnly?: boolean; limit?: number }) {
  const limit = Math.min(Math.max(opts?.limit || 50, 1), 200);
  const rows = await db
    .select()
    .from(adminNotificationsTable)
    .orderBy(desc(adminNotificationsTable.createdAt))
    .limit(limit);
  if (opts?.unreadOnly) return rows.filter((row) => !row.readAt);
  return rows;
}

export async function markNotificationRead(id: number) {
  const [updated] = await db
    .update(adminNotificationsTable)
    .set({ readAt: new Date() })
    .where(eq(adminNotificationsTable.id, id))
    .returning();
  return updated ?? null;
}

export async function markAllNotificationsRead() {
  await db
    .update(adminNotificationsTable)
    .set({ readAt: new Date() })
    .where(isNull(adminNotificationsTable.readAt));
}

const DEFAULT_SETTINGS: Record<string, string> = {
  siteName: "BonList",
  supportEmail: "support@bonlist.local",
  contactInfo: "South Africa",
  platformStatus: "live",
  registrationEnabled: "true",
  coachingAvailable: "true",
  jobPublishingEnabled: "true",
  cvReviewEnabled: "true",
};

export async function getPlatformSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(platformSettingsTable);
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export async function updatePlatformSettings(
  patch: Record<string, string>,
  updatedBy: string,
): Promise<Record<string, string>> {
  const now = new Date();
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const existing = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, key))
      .limit(1);
    if (existing[0]) {
      await db
        .update(platformSettingsTable)
        .set({ value: String(value), updatedAt: now, updatedBy })
        .where(eq(platformSettingsTable.key, key));
    } else {
      await db.insert(platformSettingsTable).values({
        key,
        value: String(value),
        updatedAt: now,
        updatedBy,
      });
    }
  }
  return getPlatformSettings();
}
