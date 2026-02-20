-- Authority to incur expenditure workflow table.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS authority_to_incur_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    title VARCHAR(255) NOT NULL,
    payee VARCHAR(255),
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
    incurred_at TIMESTAMP,
    incurred_note TEXT,
    incurred_by_id INTEGER REFERENCES users(id),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_authority_to_incur_requests_user_id ON authority_to_incur_requests (user_id);
CREATE INDEX IF NOT EXISTS ix_authority_to_incur_requests_needed_by ON authority_to_incur_requests (needed_by);
CREATE INDEX IF NOT EXISTS ix_authority_to_incur_requests_status ON authority_to_incur_requests (status);
CREATE INDEX IF NOT EXISTS ix_authority_to_incur_requests_submitted_at ON authority_to_incur_requests (submitted_at);
CREATE INDEX IF NOT EXISTS ix_authority_to_incur_requests_finance_decided_by_id ON authority_to_incur_requests (finance_decided_by_id);
CREATE INDEX IF NOT EXISTS ix_authority_to_incur_requests_ceo_decided_by_id ON authority_to_incur_requests (ceo_decided_by_id);
CREATE INDEX IF NOT EXISTS ix_authority_to_incur_requests_incurred_by_id ON authority_to_incur_requests (incurred_by_id);

COMMIT;
