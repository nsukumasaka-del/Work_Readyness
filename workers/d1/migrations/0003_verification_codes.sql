-- BonList D1: verification_codes table
-- npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0003_verification_codes.sql
-- npx wrangler d1 execute bonlist-db --local --file=./workers/d1/migrations/0003_verification_codes.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
