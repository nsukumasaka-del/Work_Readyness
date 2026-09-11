import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const jobsTable = pgTable("career_jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  sector: text("sector").notNull(),
  salary: text("salary").notNull(),
  match: integer("match").notNull(),
  posted: text("posted").notNull(),
  tags: text("tags").array().notNull(),
});

export const diagnosticReportsTable = pgTable("career_diagnostic_reports", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  authenticityScore: integer("authenticity_score").notNull(),
  atsScore: integer("ats_score").notNull(),
  flaggedPhrases: text("flagged_phrases").array().notNull(),
  missingKeywords: text("missing_keywords").array().notNull(),
  prompts: text("prompts").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coachingApplicationsTable = pgTable("career_coaching_applications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  experience: text("experience").notNull(),
  goals: text("goals").notNull(),
  paymentPlan: text("payment_plan").notNull(),
  status: text("status").notNull().default("received"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true });
export const insertDiagnosticReportSchema = createInsertSchema(diagnosticReportsTable).omit({ id: true, createdAt: true });
export const insertCoachingApplicationSchema = createInsertSchema(coachingApplicationsTable).omit({ id: true, createdAt: true, status: true });

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
export type InsertDiagnosticReport = z.infer<typeof insertDiagnosticReportSchema>;
export type DiagnosticReport = typeof diagnosticReportsTable.$inferSelect;
export type InsertCoachingApplication = z.infer<typeof insertCoachingApplicationSchema>;
export type CoachingApplication = typeof coachingApplicationsTable.$inferSelect;