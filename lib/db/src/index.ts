import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const usePglite = !databaseUrl || databaseUrl === "pglite";

async function ensureLocalSchema(
  db: ReturnType<typeof drizzlePglite>,
): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS career_jobs (
      id SERIAL PRIMARY KEY,
      title text NOT NULL,
      company text NOT NULL,
      location text NOT NULL,
      sector text NOT NULL,
      salary text NOT NULL,
      match integer NOT NULL,
      posted text NOT NULL,
      tags text[] NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS career_diagnostic_reports (
      id SERIAL PRIMARY KEY,
      file_name text NOT NULL,
      authenticity_score integer NOT NULL,
      ats_score integer NOT NULL,
      flagged_phrases text[] NOT NULL,
      missing_keywords text[] NOT NULL,
      prompts text[] NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS career_coaching_applications (
      id SERIAL PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      experience text NOT NULL,
      goals text NOT NULL,
      payment_plan text NOT NULL,
      status text NOT NULL DEFAULT 'received',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS career_profiles (
      id SERIAL PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      phone text,
      location text,
      target_role text,
      password_hash text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    ALTER TABLE career_profiles ADD COLUMN IF NOT EXISTS password_hash text
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS site_visits (
      id SERIAL PRIMARY KEY,
      path text NOT NULL,
      referrer text,
      visitor_id text NOT NULL,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id SERIAL PRIMARY KEY,
      token text NOT NULL UNIQUE,
      admin_user_id integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )
  `);
  await db.execute(sql`
    ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS admin_user_id integer
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      is_primary integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id SERIAL PRIMARY KEY,
      challenge_id text NOT NULL UNIQUE,
      email text NOT NULL,
      purpose text NOT NULL,
      code_hash text NOT NULL,
      payload text NOT NULL DEFAULT '{}',
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Additive columns for existing databases
  await db.execute(sql`ALTER TABLE career_profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);
  await db.execute(sql`ALTER TABLE career_profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS description text`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS requirements text`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS application_url text`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'Full-time'`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS work_mode text NOT NULL DEFAULT 'hybrid'`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published'`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS closing_date text`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`);
  await db.execute(sql`ALTER TABLE career_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
  await db.execute(sql`ALTER TABLE career_diagnostic_reports ADD COLUMN IF NOT EXISTS profile_id integer`);
  await db.execute(sql`ALTER TABLE career_diagnostic_reports ADD COLUMN IF NOT EXISTS profile_email text`);
  await db.execute(sql`ALTER TABLE career_diagnostic_reports ADD COLUMN IF NOT EXISTS target_role text`);
  await db.execute(sql`ALTER TABLE career_diagnostic_reports ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'`);
  await db.execute(sql`ALTER TABLE career_coaching_applications ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'`);
  await db.execute(sql`ALTER TABLE career_coaching_applications ADD COLUMN IF NOT EXISTS assigned_coach text`);
  await db.execute(sql`ALTER TABLE career_coaching_applications ADD COLUMN IF NOT EXISTS internal_notes text`);
  await db.execute(sql`ALTER TABLE career_coaching_applications ADD COLUMN IF NOT EXISTS scheduled_at text`);
  await db.execute(sql`ALTER TABLE career_coaching_applications ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
  await db.execute(sql`UPDATE career_coaching_applications SET status = 'pending' WHERE status = 'received'`);
  await db.execute(sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin'`);
  await db.execute(sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);
  await db.execute(sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz`);
  await db.execute(sql`UPDATE admin_users SET role = 'super_admin' WHERE is_primary = 1`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      admin_user_id integer,
      admin_email text NOT NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text,
      summary text NOT NULL,
      metadata text NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id SERIAL PRIMARY KEY,
      type text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      entity_type text,
      entity_id text,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS career_subscriptions (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      plan text NOT NULL DEFAULT 'free',
      status text NOT NULL DEFAULT 'active',
      started_at timestamptz NOT NULL DEFAULT now(),
      ends_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS career_programmes (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      status text NOT NULL DEFAULT 'active',
      amount_paid integer NOT NULL DEFAULT 2000,
      start_date timestamptz NOT NULL DEFAULT now(),
      end_date timestamptz NOT NULL,
      completed_lessons text[] NOT NULL DEFAULT '{}',
      current_lesson_id text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS career_generated_cvs (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      diagnostic_id integer,
      structure text NOT NULL DEFAULT 'classic',
      title text NOT NULL,
      content_json text NOT NULL,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS career_application_outcomes (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      role_title text NOT NULL,
      company text NOT NULL,
      status text NOT NULL DEFAULT 'applied',
      interview_count integer NOT NULL DEFAULT 0,
      cv_structure text,
      notes text,
      consented_to_analytics boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function createDatabase() {
  if (usePglite) {
    const dataDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../.data/pglite",
    );
    mkdirSync(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    const db = drizzlePglite(client, { schema });
    await ensureLocalSchema(db);
    return { db, pool: null as pg.Pool | null };
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzlePg(pool, { schema });
  return { db, pool };
}

const { db, pool } = await createDatabase();

export { db, pool };
export * from "./schema";
