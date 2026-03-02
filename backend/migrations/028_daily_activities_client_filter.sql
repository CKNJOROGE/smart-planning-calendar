-- Add optional client link to daily activities for posting/filtering To-Do items.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE daily_activities
    ADD COLUMN IF NOT EXISTS client_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_daily_activities_client_id'
    ) THEN
        ALTER TABLE daily_activities
            ADD CONSTRAINT fk_daily_activities_client_id
            FOREIGN KEY (client_id) REFERENCES client_accounts(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_daily_activities_client_id ON daily_activities (client_id);

COMMIT;
