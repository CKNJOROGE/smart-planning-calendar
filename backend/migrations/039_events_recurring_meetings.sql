-- Add recurring meeting metadata to events.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS series_id VARCHAR(40);

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20);

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS recurrence_until DATE;

CREATE INDEX IF NOT EXISTS ix_events_series_id ON events (series_id);

COMMIT;
