-- Add sick note attachment support for sick leave events.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS sick_note_url VARCHAR(500) NULL;

COMMIT;
