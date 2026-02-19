-- Opening leave snapshot for legacy employees.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS leave_opening_as_of DATE NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS leave_opening_accrued NUMERIC(8, 2) NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS leave_opening_used NUMERIC(8, 2) NULL;

COMMIT;
