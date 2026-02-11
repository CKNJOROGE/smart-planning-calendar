-- Slice 1.1 migration: add leave workflow columns on events for existing DBs.
-- Safe to re-run (uses IF NOT EXISTS and conservative backfills).

BEGIN;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS status VARCHAR(20);

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS requested_by_id INTEGER;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS approved_by_id INTEGER;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Backfill status for old rows.
UPDATE events
SET status = 'approved'
WHERE status IS NULL;

ALTER TABLE events
    ALTER COLUMN status SET DEFAULT 'approved';

ALTER TABLE events
    ALTER COLUMN status SET NOT NULL;

-- Add FKs (guarded with DO blocks because IF NOT EXISTS is not supported for ADD CONSTRAINT).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'events_requested_by_id_fkey'
    ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_requested_by_id_fkey
        FOREIGN KEY (requested_by_id) REFERENCES users(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'events_approved_by_id_fkey'
    ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_approved_by_id_fkey
        FOREIGN KEY (approved_by_id) REFERENCES users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_events_requested_by_id ON events (requested_by_id);
CREATE INDEX IF NOT EXISTS ix_events_approved_by_id ON events (approved_by_id);

COMMIT;
