BEGIN;

-- ============================================================
-- TASK OPERATIONS RE-ARCHITECTURE
-- ============================================================

ALTER TABLE task_workflows ADD COLUMN IF NOT EXISTS scope_type varchar(20);
ALTER TABLE task_workflows ADD COLUMN IF NOT EXISTS role_id uuid;
ALTER TABLE task_workflows ADD COLUMN IF NOT EXISTS team_id uuid;
ALTER TABLE task_workflows ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE task_workflows ADD COLUMN IF NOT EXISTS is_default_for_scope boolean;

UPDATE task_workflows SET scope_type='GENERAL' WHERE scope_type IS NULL;
UPDATE task_workflows SET is_default_for_scope=false WHERE is_default_for_scope IS NULL;

ALTER TABLE task_workflows
  ALTER COLUMN scope_type SET DEFAULT 'GENERAL',
  ALTER COLUMN scope_type SET NOT NULL,
  ALTER COLUMN is_default_for_scope SET DEFAULT false,
  ALTER COLUMN is_default_for_scope SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='task_workflows_scope_type_check'
      AND conrelid='task_workflows'::regclass
  ) THEN
    ALTER TABLE task_workflows DROP CONSTRAINT task_workflows_scope_type_check;
  END IF;
  ALTER TABLE task_workflows
    ADD CONSTRAINT task_workflows_scope_type_check
    CHECK (scope_type IN ('GENERAL','ROLE','TEAM','DEPARTMENT'));
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='task_workflows_role_id_fkey' AND conrelid='task_workflows'::regclass
  ) THEN
    ALTER TABLE task_workflows ADD CONSTRAINT task_workflows_role_id_fkey FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='task_workflows_team_id_fkey' AND conrelid='task_workflows'::regclass
  ) THEN
    ALTER TABLE task_workflows ADD CONSTRAINT task_workflows_team_id_fkey FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='task_workflows_department_id_fkey' AND conrelid='task_workflows'::regclass
  ) THEN
    ALTER TABLE task_workflows ADD CONSTRAINT task_workflows_department_id_fkey FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_task_workflows_scope ON task_workflows(scope_type, role_id, team_id, department_id, is_active);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignment_type varchar(20);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_team_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_department_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS control_state varchar(20);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_by_id uuid;

UPDATE tasks
SET assignment_type = CASE
  WHEN assigned_to_id IS NOT NULL THEN 'STAFF'
  WHEN assigned_team_id IS NOT NULL THEN 'TEAM'
  WHEN assigned_department_id IS NOT NULL THEN 'DEPARTMENT'
  ELSE 'UNASSIGNED'
END
WHERE assignment_type IS NULL;

UPDATE tasks SET control_state = CASE WHEN status='CANCELLED' THEN 'CANCELLED' ELSE 'ACTIVE' END WHERE control_state IS NULL;
UPDATE tasks SET dispatched_at=created_at WHERE dispatched_at IS NULL AND control_state='ACTIVE';

ALTER TABLE tasks
  ALTER COLUMN assignment_type SET DEFAULT 'UNASSIGNED',
  ALTER COLUMN assignment_type SET NOT NULL,
  ALTER COLUMN control_state SET DEFAULT 'ACTIVE',
  ALTER COLUMN control_state SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='tasks_assignment_type_check' AND conrelid='tasks'::regclass
  ) THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_assignment_type_check;
  END IF;
  ALTER TABLE tasks ADD CONSTRAINT tasks_assignment_type_check CHECK (assignment_type IN ('UNASSIGNED','STAFF','TEAM','DEPARTMENT'));

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='tasks_control_state_check' AND conrelid='tasks'::regclass
  ) THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_control_state_check;
  END IF;
  ALTER TABLE tasks ADD CONSTRAINT tasks_control_state_check CHECK (control_state IN ('ACTIVE','SCHEDULED','PAUSED','CANCELLED'));
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='tasks_assigned_team_id_fkey' AND conrelid='tasks'::regclass
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_team_id_fkey FOREIGN KEY(assigned_team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='tasks_assigned_department_id_fkey' AND conrelid='tasks'::regclass
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_department_id_fkey FOREIGN KEY(assigned_department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='tasks_accepted_by_id_fkey' AND conrelid='tasks'::regclass
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_accepted_by_id_fkey FOREIGN KEY(accepted_by_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tasks_team_assignment ON tasks(assigned_team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_department_assignment ON tasks(assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_for ON tasks(control_state, scheduled_for);

INSERT INTO permissions(code,name,module,description)
VALUES
  ('tasks.control','Control task lifecycle','tasks','Schedule, dispatch, pause, resume, cancel, complete and reopen tasks.')
ON CONFLICT(code) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='tasks.control'
WHERE r.code='SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- ============================================================
-- OFFICIAL LETTER APPROVAL POLICIES
-- ============================================================

ALTER TABLE letter_documents ADD COLUMN IF NOT EXISTS lead_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='letter_documents_lead_id_fkey' AND conrelid='letter_documents'::regclass
  ) THEN
    ALTER TABLE letter_documents ADD CONSTRAINT letter_documents_lead_id_fkey FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE SET NULL;
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS idx_letter_documents_lead ON letter_documents(lead_id);

-- Approval is required by default. Rows in this table mean that the matching
-- Staff/Role/Department/Team/Lead can issue letters without final approval.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='letter_approval_exemptions_subject_type_check'
      AND conrelid='letter_approval_exemptions'::regclass
  ) THEN
    ALTER TABLE letter_approval_exemptions DROP CONSTRAINT letter_approval_exemptions_subject_type_check;
  END IF;
  ALTER TABLE letter_approval_exemptions
    ADD CONSTRAINT letter_approval_exemptions_subject_type_check
    CHECK (subject_type IN ('STAFF','ROLE','DEPARTMENT','TEAM','LEAD'));
END
$$;

CREATE INDEX IF NOT EXISTS idx_letter_approval_exemptions_subject
  ON letter_approval_exemptions(subject_type, subject_id);

COMMIT;
