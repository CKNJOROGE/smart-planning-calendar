-- Add HR profile fields and document URL columns.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS id_number VARCHAR(120);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nssf_number VARCHAR(120);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nhif_number VARCHAR(120);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS id_copy_url VARCHAR(500);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS kra_copy_url VARCHAR(500);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS offer_letter_url VARCHAR(500);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employment_contract_url VARCHAR(500);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS disciplinary_records_url VARCHAR(500);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bio_data_form_url VARCHAR(500);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bank_details_form_url VARCHAR(500);

COMMIT;
