BEGIN;

ALTER TABLE cash_reimbursement_items
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE cash_reimbursement_items
    ADD COLUMN IF NOT EXISTS review_comment TEXT;

ALTER TABLE cash_reimbursement_items
    ADD COLUMN IF NOT EXISTS reviewed_by_id INTEGER;

ALTER TABLE cash_reimbursement_items
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_cash_reimbursement_items_reviewed_by_id'
    ) THEN
        ALTER TABLE cash_reimbursement_items
            ADD CONSTRAINT fk_cash_reimbursement_items_reviewed_by_id
            FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_items_review_status
    ON cash_reimbursement_items (review_status);

CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_items_reviewed_by_id
    ON cash_reimbursement_items (reviewed_by_id);

COMMIT;
