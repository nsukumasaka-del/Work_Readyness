-- Privacy-safe aggregate traffic and recoverable template deletion.
CREATE TABLE IF NOT EXISTS site_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  referrer TEXT,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_visits_created ON site_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visits_visitor ON site_visits(visitor_id);

ALTER TABLE templates ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_templates_active_not_deleted ON templates(active, deleted_at);
