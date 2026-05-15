ALTER TABLE company_documents
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(80);

CREATE INDEX IF NOT EXISTS ix_company_documents_subcategory
ON company_documents (subcategory);

CREATE TABLE IF NOT EXISTS library_subcategories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(80) NOT NULL,
    name VARCHAR(80) NOT NULL,
    created_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_library_subcategories_category_name
ON library_subcategories (category_name);

CREATE INDEX IF NOT EXISTS ix_library_subcategories_name
ON library_subcategories (name);

CREATE INDEX IF NOT EXISTS ix_library_subcategories_created_by_id
ON library_subcategories (created_by_id);

CREATE INDEX IF NOT EXISTS ix_library_subcategories_created_at
ON library_subcategories (created_at);
