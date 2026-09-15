import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import path from "node:path";
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

  // ---- Auth hardening (additive) ----
  await db.execute(sql`ALTER TABLE career_profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`);
  await db.execute(sql`ALTER TABLE career_profiles ADD COLUMN IF NOT EXISTS mfa_enabled integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE career_profiles ADD COLUMN IF NOT EXISTS totp_secret_enc text`);
  await db.execute(sql`ALTER TABLE career_profiles ADD COLUMN IF NOT EXISTS totp_verified_at timestamptz`);
  await db.execute(sql`ALTER TABLE career_profiles ADD COLUMN IF NOT EXISTS security_nudge_dismissed_at timestamptz`);
  await db.execute(sql`ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS mfa_enabled integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_secret_enc text`);
  await db.execute(sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_verified_at timestamptz`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_identities (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      provider text NOT NULL,
      provider_subject text NOT NULL,
      email text,
      email_verified integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_provider_subject_uidx
    ON auth_identities (provider, provider_subject)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      token_hash text NOT NULL UNIQUE,
      user_agent text,
      ip_address text,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      last_seen_at timestamptz
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      code_hash text NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id SERIAL PRIMARY KEY,
      profile_id integer NOT NULL,
      credential_id text NOT NULL UNIQUE,
      public_key text NOT NULL,
      counter integer NOT NULL DEFAULT 0,
      device_type text,
      backed_up integer NOT NULL DEFAULT 0,
      transports text,
      nickname text,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz
    )
  `);
}

async function openPglite(): Promise<PGlite> {
  // Never derive the data dir from import.meta.url — after esbuild bundles into
  // dist/, that resolves under dist/ and PGlite fails with ENOENT on pglite.data.
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  const dataDir = path.resolve(
    configured && configured.length > 0
      ? configured
      : path.join(process.cwd(), ".data", "pglite"),
  );

  try {
    mkdirSync(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    await client.waitReady;
    return client;
  } catch (err) {
    // Ephemeral hosts / read-only FS: still boot with an in-memory DB.
    console.warn(
      `[db] PGlite disk open failed at ${dataDir}; falling back to in-memory.`,
      err,
    );
    const memory = new PGlite();
    await memory.waitReady;
    return memory;
  }
}

async function createDatabase() {
  if (usePglite) {
    const client = await openPglite();
    const db = drizzlePglite(client, { schema });
    await ensureLocalSchema(db);
    return { db, pool: null as pg.Pool | null };
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzlePg(pool, { schema });
  // Keep Postgres schemas in sync with the same additive DDL used for pglite.
  await ensureLocalSchema(db as unknown as ReturnType<typeof drizzlePglite>);
  return { db, pool };
}

const { db, pool } = await createDatabase();

export { db, pool };
export * from "./schema";
