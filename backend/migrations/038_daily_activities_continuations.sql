ALTER TABLE daily_activities ADD COLUMN IF NOT EXISTS source_client_task_id INTEGER;
ALTER TABLE daily_activities ADD COLUMN IF NOT EXISTS continued_from_activity_id INTEGER;
ALTER TABLE daily_activities ADD COLUMN IF NOT EXISTS continued_to_activity_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_daily_activities_source_client_task_id ON daily_activities(source_client_task_id);
CREATE INDEX IF NOT EXISTS ix_daily_activities_continued_from_activity_id ON daily_activities(continued_from_activity_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_activities_continued_to_activity_id ON daily_activities(continued_to_activity_id);
