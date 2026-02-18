-- Cash reimbursement workflow tables and client reimbursement presets.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE client_accounts
    ADD COLUMN IF NOT EXISTS reimbursement_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS cash_reimbursement_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    ceo_decision VARCHAR(20) NULL,
    ceo_comment TEXT NULL,
    ceo_decided_at TIMESTAMP WITHOUT TIME ZONE NULL,
    finance_decision VARCHAR(20) NULL,
    finance_comment TEXT NULL,
    finance_decided_at TIMESTAMP WITHOUT TIME ZONE NULL,
    CONSTRAINT uq_cash_reimbursements_user_period UNIQUE (user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_requests_user_id ON cash_reimbursement_requests (user_id);
CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_requests_period_start ON cash_reimbursement_requests (period_start);
CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_requests_period_end ON cash_reimbursement_requests (period_end);

CREATE TABLE IF NOT EXISTS cash_reimbursement_items (
    id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES cash_reimbursement_requests(id) ON DELETE CASCADE,
    item_date DATE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    client_id INTEGER NULL REFERENCES client_accounts(id) ON DELETE SET NULL,
    source_event_id INTEGER NULL UNIQUE REFERENCES events(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_items_request_id ON cash_reimbursement_items (request_id);
CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_items_item_date ON cash_reimbursement_items (item_date);
CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_items_client_id ON cash_reimbursement_items (client_id);
CREATE INDEX IF NOT EXISTS ix_cash_reimbursement_items_source_event_id ON cash_reimbursement_items (source_event_id);

COMMIT;
