-- Client retainer billing + invoice lifecycle + in-app notifications

ALTER TABLE websites ADD COLUMN monthly_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE websites ADD COLUMN billing_email TEXT;
ALTER TABLE websites ADD COLUMN billing_name TEXT;
ALTER TABLE websites ADD COLUMN billing_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE websites ADD COLUMN billing_suspended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE websites ADD COLUMN last_retainer_period TEXT;

ALTER TABLE invoices ADD COLUMN kind TEXT NOT NULL DEFAULT 'adhoc';
ALTER TABLE invoices ADD COLUMN billing_period TEXT;
ALTER TABLE invoices ADD COLUMN paid_at TEXT;
ALTER TABLE invoices ADD COLUMN due_at TEXT;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoices_website_kind ON invoices(website_id, kind, billing_period);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_notifications_website ON notifications(website_id, created_at DESC);
