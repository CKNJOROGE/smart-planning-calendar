-- Salary advance workflow table.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS salary_advance_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    reason VARCHAR(255) NOT NULL,
    details TEXT,
    repayment_months INTEGER NOT NULL DEFAULT 1,
    deduction_start_date DATE,
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

CREATE INDEX IF NOT EXISTS ix_salary_advance_requests_user_id ON salary_advance_requests (user_id);
CREATE INDEX IF NOT EXISTS ix_salary_advance_requests_deduction_start_date ON salary_advance_requests (deduction_start_date);
CREATE INDEX IF NOT EXISTS ix_salary_advance_requests_status ON salary_advance_requests (status);
CREATE INDEX IF NOT EXISTS ix_salary_advance_requests_submitted_at ON salary_advance_requests (submitted_at);
CREATE INDEX IF NOT EXISTS ix_salary_advance_requests_finance_decided_by_id ON salary_advance_requests (finance_decided_by_id);
CREATE INDEX IF NOT EXISTS ix_salary_advance_requests_ceo_decided_by_id ON salary_advance_requests (ceo_decided_by_id);
CREATE INDEX IF NOT EXISTS ix_salary_advance_requests_disbursed_by_id ON salary_advance_requests (disbursed_by_id);

COMMIT;
