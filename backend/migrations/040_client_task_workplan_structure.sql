-- Add explicit workplan hierarchy columns for client tasks.
-- Safe to re-run on Postgres.

BEGIN;

ALTER TABLE client_tasks
    ADD COLUMN IF NOT EXISTS workstream VARCHAR(255);

ALTER TABLE client_tasks
    ADD COLUMN IF NOT EXISTS deliverable VARCHAR(255);

ALTER TABLE client_tasks
    ADD COLUMN IF NOT EXISTS kpi TEXT;

UPDATE client_tasks
SET
    workstream = COALESCE(NULLIF(workstream, ''), NULLIF(task, ''), 'Legacy Workstream'),
    deliverable = COALESCE(NULLIF(deliverable, ''), NULLIF(task, ''), NULLIF(subtask, ''), 'Legacy Deliverable')
WHERE
    workstream IS NULL OR workstream = '' OR deliverable IS NULL OR deliverable = '';

ALTER TABLE client_tasks
    ALTER COLUMN workstream SET NOT NULL;

ALTER TABLE client_tasks
    ALTER COLUMN deliverable SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_client_tasks_workstream ON client_tasks (workstream);
CREATE INDEX IF NOT EXISTS ix_client_tasks_deliverable ON client_tasks (deliverable);

COMMIT;
