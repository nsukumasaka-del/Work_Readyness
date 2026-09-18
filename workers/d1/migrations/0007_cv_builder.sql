-- The canonical generated_cvs table is defined in schema.sql and
-- 0007_generated_cvs.sql. Keep this migration idempotent for installations
-- that follow the CV builder setup guide.
CREATE TABLE IF NOT EXISTS generated_cvs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  structure TEXT NOT NULL,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (profile_id, version)
);

CREATE INDEX IF NOT EXISTS idx_generated_cvs_profile_created
  ON generated_cvs(profile_id, created_at DESC, id DESC);
