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
