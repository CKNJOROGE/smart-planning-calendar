-- Support one-time client names on Client Visit events.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS one_time_client_name VARCHAR(255) NULL;

COMMIT;
