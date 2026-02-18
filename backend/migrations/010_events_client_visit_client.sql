-- Add optional client reference to events for Client Visit entries.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES client_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_events_client_id ON events (client_id);

COMMIT;
