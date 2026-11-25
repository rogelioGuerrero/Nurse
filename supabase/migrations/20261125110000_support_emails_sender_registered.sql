-- Track whether the sender of an inbound support email is a registered BienCuidar user.
-- Unregistered senders are escalated to the admin (needs_human) instead of auto-replied.
ALTER TABLE support_emails ADD COLUMN IF NOT EXISTS sender_registered boolean NOT NULL DEFAULT true;
