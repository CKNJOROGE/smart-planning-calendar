-- Add checklist fields for dashboard daily activities.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE daily_activities
    ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE daily_activities
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS ix_daily_activities_completed ON daily_activities (completed);

COMMIT;
