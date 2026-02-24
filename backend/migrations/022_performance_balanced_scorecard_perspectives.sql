-- Balanced Scorecard update for performance module.
-- Adds perspective to company and department goals.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE performance_company_goals
    ADD COLUMN IF NOT EXISTS perspective VARCHAR(40) NOT NULL DEFAULT 'financial';

ALTER TABLE performance_department_goals
    ADD COLUMN IF NOT EXISTS perspective VARCHAR(40) NOT NULL DEFAULT 'financial';

CREATE INDEX IF NOT EXISTS ix_performance_company_goals_perspective
    ON performance_company_goals (perspective);

CREATE INDEX IF NOT EXISTS ix_performance_department_goals_perspective
    ON performance_department_goals (perspective);

COMMIT;
