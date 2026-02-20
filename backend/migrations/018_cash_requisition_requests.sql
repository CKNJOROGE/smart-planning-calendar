-- Cash requisition workflow table.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS cash_requisition_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    purpose VARCHAR(255) NOT NULL,
    details TEXT,
    needed_by DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'pending_finance_review',
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finance_decision VARCHAR(20),
    finance_comment TEXT,
    finance_decided_at TIMESTAMP,
    finance_decided_by_id INTEGER REFERENCES users(id),
    ceo_decision VARCHAR(20),
    ceo_comment TEXT,
    ceo_decided_at TIMESTAMP,
    ceo_decided_by_id INTEGER REFERENCES users(id),
    disbursed_at TIMESTAMP,
    disbursed_note TEXT,
    disbursed_by_id INTEGER REFERENCES users(id),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_cash_requisition_requests_user_id ON cash_requisition_requests (user_id);
CREATE INDEX IF NOT EXISTS ix_cash_requisition_requests_needed_by ON cash_requisition_requests (needed_by);
CREATE INDEX IF NOT EXISTS ix_cash_requisition_requests_status ON cash_requisition_requests (status);
CREATE INDEX IF NOT EXISTS ix_cash_requisition_requests_submitted_at ON cash_requisition_requests (submitted_at);
CREATE INDEX IF NOT EXISTS ix_cash_requisition_requests_finance_decided_by_id ON cash_requisition_requests (finance_decided_by_id);
CREATE INDEX IF NOT EXISTS ix_cash_requisition_requests_ceo_decided_by_id ON cash_requisition_requests (ceo_decided_by_id);
CREATE INDEX IF NOT EXISTS ix_cash_requisition_requests_disbursed_by_id ON cash_requisition_requests (disbursed_by_id);

COMMIT;
