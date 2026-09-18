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
