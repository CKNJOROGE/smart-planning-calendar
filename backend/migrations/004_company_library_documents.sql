-- Company-wide document library table.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS company_documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(80) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    uploaded_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_company_documents_category ON company_documents (category);
CREATE INDEX IF NOT EXISTS ix_company_documents_uploaded_by_id ON company_documents (uploaded_by_id);
CREATE INDEX IF NOT EXISTS ix_company_documents_created_at ON company_documents (created_at);

COMMIT;
