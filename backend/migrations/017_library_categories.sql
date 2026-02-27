-- Add custom library categories managed by admin/ceo.
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS library_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE,
    created_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Backward-compatible fixes for databases where this table already existed
-- without created_at default/not-null guarantees.
ALTER TABLE library_categories
    ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id);
ALTER TABLE library_categories
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;
UPDATE library_categories
SET created_at = NOW()
WHERE created_at IS NULL;
ALTER TABLE library_categories
    ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE library_categories
    ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_library_categories_name ON library_categories (name);
CREATE INDEX IF NOT EXISTS ix_library_categories_created_by_id ON library_categories (created_by_id);
CREATE INDEX IF NOT EXISTS ix_library_categories_created_at ON library_categories (created_at);

INSERT INTO library_categories (name)
VALUES
    ('Contract'),
    ('Recruitment'),
    ('Onboarding'),
    ('Performance Management'),
    ('Disciplinary Management'),
    ('Training Template')
ON CONFLICT (name) DO NOTHING;

COMMIT;
