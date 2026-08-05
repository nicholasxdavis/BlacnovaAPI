-- Support ticket status for platform admin inbox
ALTER TABLE support_tickets ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE support_tickets ADD COLUMN notes TEXT;
