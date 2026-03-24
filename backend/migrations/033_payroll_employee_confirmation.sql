ALTER TABLE payroll_runs ADD COLUMN employee_confirmed BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN employee_confirmed_at DATETIME;
