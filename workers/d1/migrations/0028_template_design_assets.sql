ALTER TABLE templates ADD COLUMN definition_json TEXT;
ALTER TABLE templates ADD COLUMN asset_key TEXT;
CREATE TABLE IF NOT EXISTS template_catalog_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  initialized_at TEXT NOT NULL DEFAULT (datetime('now'))
);
