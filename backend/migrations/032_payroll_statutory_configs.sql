CREATE TABLE IF NOT EXISTS payroll_statutory_configs (
  id SERIAL PRIMARY KEY,
  effective_from DATE NOT NULL UNIQUE,
  effective_to DATE,
  active BOOLEAN NOT NULL DEFAULT 1,
  paye_bands_json TEXT NOT NULL DEFAULT '[]',
  personal_relief_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  insurance_relief_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  insurance_relief_cap_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  owner_occupier_interest_cap_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  shif_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  shif_minimum_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  ahl_rate_employee NUMERIC(8,4) NOT NULL DEFAULT 0,
  ahl_rate_employer NUMERIC(8,4) NOT NULL DEFAULT 0,
  nssf_lower_earnings_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  nssf_upper_earnings_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  nssf_employee_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  nssf_employer_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  nita_levy_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  non_cash_benefit_taxable_threshold NUMERIC(12,2) NOT NULL DEFAULT 0,
  disability_exemption_cap_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  source_notes_json TEXT NOT NULL DEFAULT '[]',
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  updated_by_id INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_payroll_statutory_configs_effective_from ON payroll_statutory_configs(effective_from);
CREATE INDEX IF NOT EXISTS ix_payroll_statutory_configs_effective_to ON payroll_statutory_configs(effective_to);
