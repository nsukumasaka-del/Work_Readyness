CREATE TABLE IF NOT EXISTS cv_shares (
  token TEXT PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES generated_cvs(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
