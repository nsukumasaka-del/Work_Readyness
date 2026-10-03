CREATE TABLE IF NOT EXISTS yoco_orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item_type TEXT NOT NULL CHECK(item_type IN ('TEMPLATE_DOWNLOAD','JOB_MATCH_UNLOCK','MEGA_ACCESS')),
 target_id TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 checkout_id TEXT UNIQUE, payment_id TEXT UNIQUE, paid_at TEXT, expires_at TEXT, mode TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_yoco_orders_user ON yoco_orders(user_id, status);
