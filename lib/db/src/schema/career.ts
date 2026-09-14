import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const jobsTable = pgTable("career_jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  sector: text("sector").notNull(),
  salary: text("salary").notNull(),
  match: integer("match").notNull().default(80),
  posted: text("posted").notNull().default("Recently"),
  tags: text("tags").array().notNull(),
  description: text("description"),
  requirements: text("requirements"),
  applicationUrl: text("application_url"),
  employmentType: text("employment_type").notNull().default("Full-time"),
  workMode: text("work_mode").notNull().default("hybrid"),
  status: text("status").notNull().default("published"),
  closingDate: text("closing_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const diagnosticReportsTable = pgTable("career_diagnostic_reports", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  authenticityScore: integer("authenticity_score").notNull(),
  atsScore: integer("ats_score").notNull(),
  flaggedPhrases: text("flagged_phrases").array().notNull(),
  missingKeywords: text("missing_keywords").array().notNull(),
  prompts: text("prompts").array().notNull(),
  profileId: integer("profile_id"),
  profileEmail: text("profile_email"),
  targetRole: text("target_role"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coachingApplicationsTable = pgTable("career_coaching_applications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  experience: text("experience").notNull(),
  goals: text("goals").notNull(),
  paymentPlan: text("payment_plan").notNull(),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("normal"),
  assignedCoach: text("assigned_coach"),
  internalNotes: text("internal_notes"),
  scheduledAt: text("scheduled_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profilesTable = pgTable("career_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  location: text("location"),
  targetRole: text("target_role"),
  passwordHash: text("password_hash"),
  status: text("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteVisitsTable = pgTable("site_visits", {
  id: serial("id").primaryKey(),
  path: text("path").notNull(),
  referrer: text("referrer"),
  visitorId: text("visitor_id").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessionsTable = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  adminUserId: integer("admin_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const adminUsersTable = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  isPrimary: integer("is_primary").notNull().default(0),
  role: text("role").notNull().default("admin"),
  status: text("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authChallengesTable = pgTable("auth_challenges", {
  id: serial("id").primaryKey(),
  challengeId: text("challenge_id").notNull(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull(),
  codeHash: text("code_hash").notNull(),
  payload: text("payload").notNull().default("{}"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminAuditLogTable = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id"),
  adminEmail: text("admin_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminNotificationsTable = pgTable("admin_notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformSettingsTable = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

/** Monthly SaaS plans: free | job_seeker | career_pro */
export const subscriptionsTable = pgTable("career_subscriptions", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull(),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Stand-alone 3-month Career Accelerator programme (R2,000 once-off) */
export const programmesTable = pgTable("career_programmes", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull(),
  status: text("status").notNull().default("active"),
  amountPaid: integer("amount_paid").notNull().default(2000),
  startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  completedLessons: text("completed_lessons").array().notNull().default([]),
  currentLessonId: text("current_lesson_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Generated CVs from the post-review CV builder */
export const generatedCvsTable = pgTable("career_generated_cvs", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull(),
  diagnosticId: integer("diagnostic_id"),
  structure: text("structure").notNull().default("classic"),
  title: text("title").notNull(),
  contentJson: text("content_json").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDiagnosticReportSchema = createInsertSchema(diagnosticReportsTable).omit({ id: true, createdAt: true });
export const insertCoachingApplicationSchema = createInsertSchema(coachingApplicationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  priority: true,
  assignedCoach: true,
  internalNotes: true,
  scheduledAt: true,
});
export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true, lastLoginAt: true, status: true });
export const insertSiteVisitSchema = createInsertSchema(siteVisitsTable).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProgrammeSchema = createInsertSchema(programmesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/** Consented Candidate Application Outcome Signals (Section 41 — Empirical Learning) */
export const applicationOutcomesTable = pgTable("career_application_outcomes", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull(),
  roleTitle: text("role_title").notNull(),
  company: text("company").notNull(),
  status: text("status").notNull().default("applied"), // applied | screening | shortlist | interview | offer | hired | unsuccessful
  interviewCount: integer("interview_count").notNull().default(0),
  cvStructure: text("cv_structure"),
  notes: text("notes"),
  consentedToAnalytics: boolean("consented_to_analytics").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApplicationOutcomeSchema = createInsertSchema(applicationOutcomesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
export type InsertDiagnosticReport = z.infer<typeof insertDiagnosticReportSchema>;
export type DiagnosticReport = typeof diagnosticReportsTable.$inferSelect;
export type InsertCoachingApplication = z.infer<typeof insertCoachingApplicationSchema>;
export type CoachingApplication = typeof coachingApplicationsTable.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
export type InsertSiteVisit = z.infer<typeof insertSiteVisitSchema>;
export type SiteVisit = typeof siteVisitsTable.$inferSelect;
export type AdminSession = typeof adminSessionsTable.$inferSelect;
export type AdminUser = typeof adminUsersTable.$inferSelect;
export type AuthChallenge = typeof authChallengesTable.$inferSelect;
export type AdminAuditLog = typeof adminAuditLogTable.$inferSelect;
export type AdminNotification = typeof adminNotificationsTable.$inferSelect;
export type PlatformSetting = typeof platformSettingsTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Programme = typeof programmesTable.$inferSelect;
export type InsertProgramme = z.infer<typeof insertProgrammeSchema>;
export type GeneratedCv = typeof generatedCvsTable.$inferSelect;
export type ApplicationOutcome = typeof applicationOutcomesTable.$inferSelect;
export type InsertApplicationOutcome = z.infer<typeof insertApplicationOutcomeSchema>;
