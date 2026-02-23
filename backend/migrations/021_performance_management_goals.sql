-- Performance management hierarchy:
-- Company goals -> Department goals -> Employee goals
-- Safe to re-run on Postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS performance_company_goals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    period_start DATE,
    period_end DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_performance_company_goals_period_start ON performance_company_goals (period_start);
CREATE INDEX IF NOT EXISTS ix_performance_company_goals_period_end ON performance_company_goals (period_end);
CREATE INDEX IF NOT EXISTS ix_performance_company_goals_status ON performance_company_goals (status);
CREATE INDEX IF NOT EXISTS ix_performance_company_goals_created_by_id ON performance_company_goals (created_by_id);

CREATE TABLE IF NOT EXISTS performance_department_goals (
    id SERIAL PRIMARY KEY,
    company_goal_id INTEGER NOT NULL REFERENCES performance_company_goals(id) ON DELETE CASCADE,
    department VARCHAR(120) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    period_start DATE,
    period_end DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_performance_department_goals_company_goal_id ON performance_department_goals (company_goal_id);
CREATE INDEX IF NOT EXISTS ix_performance_department_goals_department ON performance_department_goals (department);
CREATE INDEX IF NOT EXISTS ix_performance_department_goals_period_start ON performance_department_goals (period_start);
CREATE INDEX IF NOT EXISTS ix_performance_department_goals_period_end ON performance_department_goals (period_end);
CREATE INDEX IF NOT EXISTS ix_performance_department_goals_status ON performance_department_goals (status);
CREATE INDEX IF NOT EXISTS ix_performance_department_goals_created_by_id ON performance_department_goals (created_by_id);

CREATE TABLE IF NOT EXISTS performance_employee_goals (
    id SERIAL PRIMARY KEY,
    department_goal_id INTEGER NOT NULL REFERENCES performance_department_goals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    progress_percent INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    self_comment TEXT,
    manager_comment TEXT,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    updated_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_performance_employee_goals_department_goal_id ON performance_employee_goals (department_goal_id);
CREATE INDEX IF NOT EXISTS ix_performance_employee_goals_user_id ON performance_employee_goals (user_id);
CREATE INDEX IF NOT EXISTS ix_performance_employee_goals_status ON performance_employee_goals (status);
CREATE INDEX IF NOT EXISTS ix_performance_employee_goals_created_by_id ON performance_employee_goals (created_by_id);
CREATE INDEX IF NOT EXISTS ix_performance_employee_goals_updated_by_id ON performance_employee_goals (updated_by_id);

COMMIT;
