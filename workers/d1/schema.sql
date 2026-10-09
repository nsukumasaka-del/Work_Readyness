-- BonList Cloudflare D1 schema (SQLite) — full create for new environments
-- Apply with:
--   npx wrangler d1 execute bonlist-db --local --file=./workers/d1/schema.sql
--   npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  code_hash TEXT,
  token_hash TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_email ON auth_challenges (email);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_purpose ON auth_challenges (purpose);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges (expires_at);

CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_email ON auth_identities (email);

CREATE TABLE IF NOT EXISTS career_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  target_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_career_profiles_email ON career_profiles(email);

CREATE TABLE IF NOT EXISTS cv_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cv_reports_user_created ON cv_reports(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS generated_cvs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  structure TEXT NOT NULL,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completion_score INTEGER NOT NULL DEFAULT 0,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (profile_id, version)
);

CREATE INDEX IF NOT EXISTS idx_generated_cvs_profile_created
  ON generated_cvs(profile_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS application_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  company TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  interview_count INTEGER NOT NULL DEFAULT 0,
  cv_structure TEXT,
  notes TEXT,
  consented_to_analytics INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_application_outcomes_user_created
  ON application_outcomes(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS career_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keywords TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  posted_range TEXT NOT NULL DEFAULT '',
  deep_search INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER NOT NULL DEFAULT 0,
  result_limit INTEGER NOT NULL DEFAULT 50,
  queried_boards_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_search_history_user_created
  ON job_search_history(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS career_programmes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  completed_lessons_json TEXT NOT NULL DEFAULT '[]',
  current_lesson_id TEXT,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coaching_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  experience TEXT NOT NULL,
  goals TEXT NOT NULL,
  payment_plan TEXT NOT NULL DEFAULT 'programme',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coaching_applications_user_created
  ON coaching_applications(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_reference TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('template', 'credits')),
  item_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'refunded')),
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_records_user_created ON payment_records(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_template_entitlements (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'refunded')),
  UNIQUE (user_id, template_id),
  FOREIGN KEY (payment_reference) REFERENCES payment_records(provider_reference)
);
CREATE INDEX IF NOT EXISTS idx_template_entitlements_user ON user_template_entitlements(user_id, status);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'CV',
  preview_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_templates_created ON templates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_active_not_deleted ON templates(active, deleted_at);

CREATE TABLE IF NOT EXISTS site_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  referrer TEXT,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_visits_created ON site_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visits_visitor ON site_visits(visitor_id);

CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('purchase', 'spend', 'refund', 'admin_adjustment')),
  feature_id TEXT,
  payment_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (payment_reference) REFERENCES payment_records(provider_reference)
);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created ON credit_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS premium_feature_catalog (
  feature_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  credit_cost INTEGER NOT NULL CHECK (credit_cost > 0),
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO premium_feature_catalog (feature_id, name, description, credit_cost) VALUES
  ('improve_cv', 'Advanced CV Improvement', 'A comprehensive improvement of wording, clarity, structure and impact without changing the facts.', 2),
  ('ats_review', 'Advanced ATS Review', 'A detailed readability and ATS analysis with practical recommendations.', 2),
  ('tailor_cv', 'Tailor My CV for a Job', 'Tailor an existing CV to a vacancy without fabricating experience, qualifications or skills.', 3);

CREATE TABLE IF NOT EXISTS yoco_orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item_type TEXT NOT NULL CHECK(item_type IN ('TEMPLATE_DOWNLOAD','JOB_MATCH_UNLOCK','MEGA_ACCESS')),
 target_id TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 checkout_id TEXT UNIQUE, payment_id TEXT UNIQUE, paid_at TEXT, expires_at TEXT, mode TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_yoco_orders_user ON yoco_orders(user_id, status);
