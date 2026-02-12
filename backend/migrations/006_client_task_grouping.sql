-- Add task_group_id to support multiple subtasks under one task.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE client_tasks
    ADD COLUMN IF NOT EXISTS task_group_id VARCHAR(40);

UPDATE client_tasks
SET task_group_id = CONCAT('legacy_', id::text)
WHERE task_group_id IS NULL OR task_group_id = '';

ALTER TABLE client_tasks
    ALTER COLUMN task_group_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_client_tasks_task_group_id ON client_tasks (task_group_id);

COMMIT;
