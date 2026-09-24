-- Extend generated CV rows into durable, editable user-owned documents.
ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE generated_cvs ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE generated_cvs ADD COLUMN completion_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE generated_cvs ADD COLUMN preferences_json TEXT NOT NULL DEFAULT '{}';

UPDATE generated_cvs SET updated_at = created_at WHERE updated_at = '';
UPDATE users SET updated_at = created_at WHERE updated_at = '';
CREATE INDEX IF NOT EXISTS idx_generated_cvs_user_updated
  ON generated_cvs(user_id, updated_at DESC, id DESC);
