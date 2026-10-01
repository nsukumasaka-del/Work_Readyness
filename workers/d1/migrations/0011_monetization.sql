-- Lifetime template ownership, verified payments, and an auditable credit ledger.
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
