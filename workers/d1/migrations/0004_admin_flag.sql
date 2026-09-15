-- BonList D1: admin flag on users
-- npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0004_admin_flag.sql
-- npx wrangler d1 execute bonlist-db --local --file=./workers/d1/migrations/0004_admin_flag.sql

PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
