CREATE TABLE IF NOT EXISTS client_task_reports (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    generated_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    quarter INTEGER NOT NULL,
    report_kind VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    overview TEXT NOT NULL,
    report_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_client_task_reports_client_id
    ON client_task_reports (client_id);

CREATE INDEX IF NOT EXISTS ix_client_task_reports_generated_by_id
    ON client_task_reports (generated_by_id);

CREATE INDEX IF NOT EXISTS ix_client_task_reports_year
    ON client_task_reports (year);

CREATE INDEX IF NOT EXISTS ix_client_task_reports_quarter
    ON client_task_reports (quarter);

CREATE INDEX IF NOT EXISTS ix_client_task_reports_report_kind
    ON client_task_reports (report_kind);
