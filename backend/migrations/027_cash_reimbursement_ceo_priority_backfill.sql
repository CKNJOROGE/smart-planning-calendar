-- Backfill reimbursement statuses after CEO-priority approval change.
-- Safe to re-run on Postgres.

BEGIN;

-- If CEO approved and there is no rejection, request should proceed to reimbursement.
UPDATE cash_reimbursement_requests
SET status = 'pending_reimbursement'
WHERE status = 'pending_approval'
  AND LOWER(COALESCE(ceo_decision, '')) = 'approved'
  AND LOWER(COALESCE(finance_decision, '')) <> 'rejected';

COMMIT;
