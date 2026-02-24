-- Department designations registry.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS designations (
    id SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    created_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_designations_department_name UNIQUE (department_id, name)
);

CREATE INDEX IF NOT EXISTS ix_designations_department_id ON designations (department_id);
CREATE INDEX IF NOT EXISTS ix_designations_created_by_id ON designations (created_by_id);

INSERT INTO designations (department_id, name, created_by_id, created_at)
SELECT DISTINCT
    d.id AS department_id,
    TRIM(u.designation) AS name,
    NULL::INTEGER AS created_by_id,
    NOW() AS created_at
FROM users u
JOIN departments d ON LOWER(TRIM(d.name)) = LOWER(TRIM(u.department))
WHERE TRIM(COALESCE(u.department, '')) <> ''
  AND TRIM(COALESCE(u.designation, '')) <> ''
ON CONFLICT (department_id, name) DO NOTHING;

COMMIT;
