ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

UPDATE users SET role = 'platform' WHERE email = 'nic@blacnova.net' COLLATE NOCASE;
