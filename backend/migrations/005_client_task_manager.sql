-- Client task manager tables.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS client_accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_by_id INTEGER NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_client_accounts_name ON client_accounts (name);
CREATE INDEX IF NOT EXISTS ix_client_accounts_created_by_id ON client_accounts (created_by_id);

CREATE TABLE IF NOT EXISTS client_tasks (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES client_accounts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    year INTEGER NOT NULL,
    quarter INTEGER NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
    task VARCHAR(255) NOT NULL,
    subtask TEXT NOT NULL,
    completion_date DATE NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_client_tasks_client_id ON client_tasks (client_id);
CREATE INDEX IF NOT EXISTS ix_client_tasks_user_id ON client_tasks (user_id);
CREATE INDEX IF NOT EXISTS ix_client_tasks_year ON client_tasks (year);
CREATE INDEX IF NOT EXISTS ix_client_tasks_quarter ON client_tasks (quarter);
CREATE INDEX IF NOT EXISTS ix_client_tasks_year_quarter ON client_tasks (year, quarter);

COMMIT;
