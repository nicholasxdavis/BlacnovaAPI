CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  password_hash TEXT NOT NULL,
  website_id TEXT NOT NULL,
  notify_submissions INTEGER NOT NULL DEFAULT 1,
  notify_maintenance INTEGER NOT NULL DEFAULT 1,
  notify_weekly_email INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS websites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'live',
  modules TEXT NOT NULL,
  github_repo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_blocks (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  section TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  updated_at TEXT NOT NULL DEFAULT (date('now')),
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size TEXT NOT NULL,
  used_on TEXT NOT NULL DEFAULT '',
  content_type TEXT,
  url TEXT,
  updated_at TEXT NOT NULL DEFAULT (date('now')),
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance (
  website_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  expected_return TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Contact form',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analytics_points (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  date TEXT NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  submissions INTEGER NOT NULL DEFAULT 0,
  UNIQUE (website_id, date),
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  website_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_website ON content_blocks(website_id);
CREATE INDEX IF NOT EXISTS idx_pages_website ON pages(website_id);
CREATE INDEX IF NOT EXISTS idx_media_website ON media_items(website_id);
CREATE INDEX IF NOT EXISTS idx_submissions_website ON submissions(website_id);
CREATE INDEX IF NOT EXISTS idx_analytics_website ON analytics_points(website_id);
