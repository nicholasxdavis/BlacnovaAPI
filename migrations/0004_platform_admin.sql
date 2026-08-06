ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

-- Promote the finance owner account to platform after seed via D1 (email comes from env, not this file).
