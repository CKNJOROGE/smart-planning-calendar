-- Add late-submission tracking for reimbursement requests.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE cash_reimbursement_requests
    ADD COLUMN IF NOT EXISTS is_late_submission BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_requests_is_late_submission
    ON cash_reimbursement_requests (is_late_submission);

COMMIT;
