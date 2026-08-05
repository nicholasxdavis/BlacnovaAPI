CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  website_id TEXT,
  customer_email TEXT NOT NULL COLLATE NOCASE,
  customer_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  stripe_invoice_id TEXT,
  stripe_customer_id TEXT,
  hosted_invoice_url TEXT,
  invoice_pdf TEXT,
  recurring_id TEXT,
  days_until_due INTEGER NOT NULL DEFAULT 14,
  sent_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_invoices (
  id TEXT PRIMARY KEY,
  website_id TEXT,
  customer_email TEXT NOT NULL COLLATE NOCASE,
  customer_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  description TEXT NOT NULL,
  day_of_month INTEGER NOT NULL,
  days_until_due INTEGER NOT NULL DEFAULT 14,
  active INTEGER NOT NULL DEFAULT 1,
  last_sent_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_invoices(active, day_of_month);
