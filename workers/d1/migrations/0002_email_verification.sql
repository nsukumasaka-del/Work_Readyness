-- BonList D1 auth v2: email verification + password reset
-- npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0002_email_verification.sql
-- npx wrangler d1 execute bonlist-db --local --file=./workers/d1/migrations/0002_email_verification.sql

PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;

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
