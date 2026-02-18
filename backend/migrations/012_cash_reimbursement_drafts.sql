-- Persist cash reimbursement drafts (manual rows) in backend storage.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS cash_reimbursement_drafts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    manual_items_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cash_reimbursement_drafts_user_period UNIQUE (user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_drafts_user_id ON cash_reimbursement_drafts (user_id);
CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_drafts_period_start ON cash_reimbursement_drafts (period_start);
CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_drafts_period_end ON cash_reimbursement_drafts (period_end);

COMMIT;
