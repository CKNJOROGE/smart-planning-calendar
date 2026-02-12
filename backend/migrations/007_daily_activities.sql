CREATE TABLE IF NOT EXISTS daily_activities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    activity TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_daily_activities_user_id ON daily_activities (user_id);
CREATE INDEX IF NOT EXISTS ix_daily_activities_activity_date ON daily_activities (activity_date);
