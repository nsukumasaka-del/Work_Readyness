-- Reserved for the edge-native CV builder.
-- The current builder response is intentionally generated from the verified
-- request payload. This table makes persistence available without requiring
-- the legacy Node/Postgres API.
CREATE TABLE IF NOT EXISTS generated_cvs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  structure TEXT NOT NULL,
  title TEXT NOT NULL,
  document_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_generated_cvs_user_created
  ON generated_cvs(user_id, created_at DESC, id DESC);