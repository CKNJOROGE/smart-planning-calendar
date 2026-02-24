-- Departments registry + optional company parent for department goals.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    created_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_departments_name ON departments (name);
CREATE INDEX IF NOT EXISTS ix_departments_created_by_id ON departments (created_by_id);

-- Backfill existing departments from user profiles.
INSERT INTO departments (name, created_by_id, created_at)
SELECT DISTINCT
    TRIM(u.department) AS name,
    NULL AS created_by_id,
    NOW() AS created_at
FROM users u
WHERE TRIM(COALESCE(u.department, '')) <> ''
ON CONFLICT (name) DO NOTHING;

-- Backfill departments used by performance department goals.
INSERT INTO departments (name, created_by_id, created_at)
SELECT DISTINCT
    TRIM(g.department) AS name,
    NULL AS created_by_id,
    NOW() AS created_at
FROM performance_department_goals g
WHERE TRIM(COALESCE(g.department, '')) <> ''
ON CONFLICT (name) DO NOTHING;

-- Parent company goal link is no longer mandatory from UI.
ALTER TABLE performance_department_goals
    ALTER COLUMN company_goal_id DROP NOT NULL;

COMMIT;
