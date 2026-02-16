-- Group daily activity checklist items that were posted together.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE daily_activities
    ADD COLUMN IF NOT EXISTS post_group_id VARCHAR(40);

UPDATE daily_activities
SET post_group_id = CONCAT('legacy_', id::text)
WHERE post_group_id IS NULL OR post_group_id = '';

CREATE INDEX IF NOT EXISTS ix_daily_activities_post_group_id ON daily_activities (post_group_id);

COMMIT;
