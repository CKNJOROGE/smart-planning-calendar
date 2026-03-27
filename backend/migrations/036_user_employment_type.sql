ALTER TABLE users
ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20) DEFAULT 'employee';

UPDATE users
SET employment_type = 'employee'
WHERE employment_type IS NULL;
