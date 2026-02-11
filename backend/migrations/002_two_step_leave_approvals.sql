-- Add two-step leave approval support.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS require_two_step_leave_approval BOOLEAN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_approver_id INTEGER;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS second_approver_id INTEGER;

UPDATE users
SET require_two_step_leave_approval = FALSE
WHERE require_two_step_leave_approval IS NULL;

ALTER TABLE users
    ALTER COLUMN require_two_step_leave_approval SET DEFAULT FALSE;

ALTER TABLE users
    ALTER COLUMN require_two_step_leave_approval SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_first_approver_id_fkey'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_first_approver_id_fkey
        FOREIGN KEY (first_approver_id) REFERENCES users(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_second_approver_id_fkey'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_second_approver_id_fkey
        FOREIGN KEY (second_approver_id) REFERENCES users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_users_first_approver_id ON users (first_approver_id);
CREATE INDEX IF NOT EXISTS ix_users_second_approver_id ON users (second_approver_id);

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS first_approved_by_id INTEGER;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS second_approved_by_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_first_approved_by_id_fkey'
    ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_first_approved_by_id_fkey
        FOREIGN KEY (first_approved_by_id) REFERENCES users(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_second_approved_by_id_fkey'
    ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_second_approved_by_id_fkey
        FOREIGN KEY (second_approved_by_id) REFERENCES users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_events_first_approved_by_id ON events (first_approved_by_id);
CREATE INDEX IF NOT EXISTS ix_events_second_approved_by_id ON events (second_approved_by_id);

COMMIT;
