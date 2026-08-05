CREATE TABLE IF NOT EXISTS bmc_entries (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  event_id TEXT,
  event_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  supporter_name TEXT,
  supporter_email TEXT,
  message TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  coffees INTEGER,
  membership_level TEXT,
  live_mode INTEGER NOT NULL DEFAULT 1,
  occurred_at TEXT NOT NULL,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bmc_entries_occurred ON bmc_entries(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bmc_entries_kind ON bmc_entries(kind, status);
