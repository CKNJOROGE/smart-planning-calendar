BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS supervisor_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_users_supervisor_id'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT fk_users_supervisor_id
            FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_users_supervisor_id ON users (supervisor_id);

CREATE TABLE IF NOT EXISTS performance_appraisals (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    review_year INTEGER NOT NULL,
    review_quarter VARCHAR(2) NOT NULL,
    employee_payload_json TEXT NOT NULL DEFAULT '{}',
    supervisor_payload_json TEXT NOT NULL DEFAULT '{}',
    supervisor_reviewed_by_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    employee_updated_at TIMESTAMP NULL,
    supervisor_updated_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_performance_appraisals_employee_period
    ON performance_appraisals (employee_id, review_year, review_quarter);

CREATE INDEX IF NOT EXISTS ix_performance_appraisals_employee_id
    ON performance_appraisals (employee_id);

CREATE INDEX IF NOT EXISTS ix_performance_appraisals_supervisor_reviewed_by_id
    ON performance_appraisals (supervisor_reviewed_by_id);

CREATE INDEX IF NOT EXISTS ix_performance_appraisals_review_year
    ON performance_appraisals (review_year);

CREATE INDEX IF NOT EXISTS ix_performance_appraisals_review_quarter
    ON performance_appraisals (review_quarter);

COMMIT;
