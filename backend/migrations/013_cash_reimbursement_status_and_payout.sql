-- Add payout tracking and normalized reimbursement statuses.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE cash_reimbursement_requests
    ALTER COLUMN status TYPE VARCHAR(40);

ALTER TABLE cash_reimbursement_requests
    ADD COLUMN IF NOT EXISTS reimbursed_by_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE cash_reimbursement_requests
    ADD COLUMN IF NOT EXISTS reimbursed_at TIMESTAMP WITHOUT TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_requests_reimbursed_by_id
    ON cash_reimbursement_requests (reimbursed_by_id);

-- Normalize status naming:
-- pending -> pending_approval
-- approved -> pending_reimbursement
UPDATE cash_reimbursement_requests
SET status = 'pending_approval'
WHERE status = 'pending';

UPDATE cash_reimbursement_requests
SET status = 'pending_reimbursement'
WHERE status = 'approved';

COMMIT;
