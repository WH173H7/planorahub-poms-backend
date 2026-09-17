BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM (
      'TODO',
      'IN_PROGRESS',
      'AWAITING_RESPONSE',
      'BLOCKED',
      'COMPLETED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM (
      'LOW',
      'MEDIUM',
      'HIGH',
      'URGENT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_event_type') THEN
    CREATE TYPE task_event_type AS ENUM (
      'TASK_CREATED',
      'TASK_ASSIGNED',
      'STATUS_CHANGED',
      'COMMENT_ADDED',
      'REPLY_ADDED',
      'FILE_UPLOADED',
      'DUE_DATE_CHANGED',
      'PRIORITY_CHANGED',
      'ASSIGNEE_CHANGED',
      'TASK_COMPLETED',
      'TASK_REOPENED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(240) NOT NULL,
  description TEXT,

  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,

  status task_status NOT NULL DEFAULT 'TODO',
  priority task_priority NOT NULL DEFAULT 'MEDIUM',

  start_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_organization ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);

CREATE TABLE IF NOT EXISTS task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type task_event_type NOT NULL,
  message TEXT,
  old_values JSONB,
  new_values JSONB,
  parent_event_id UUID REFERENCES task_events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task
  ON task_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_events_parent
  ON task_events(parent_event_id);

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_id UUID REFERENCES task_events(id) ON DELETE CASCADE,
  uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  mime_type VARCHAR(160),
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_event ON task_attachments(event_id);

INSERT INTO permissions (code, name, module, description)
VALUES
  ('tasks.read.all','View all tasks','tasks','View all tasks across the organization.'),
  ('tasks.create','Create tasks','tasks','Create and assign operational tasks.'),
  ('tasks.update.all','Update all tasks','tasks','Edit any operational task.'),
  ('tasks.comment','Comment on tasks','tasks','Add progress updates and replies to tasks.'),
  ('tasks.assign','Assign tasks','tasks','Assign or reassign tasks to staff.'),
  ('tasks.complete','Complete tasks','tasks','Mark tasks completed or reopen them.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND p.code IN (
    'tasks.read.all','tasks.create','tasks.update.all',
    'tasks.comment','tasks.assign','tasks.complete'
  )
ON CONFLICT DO NOTHING;

COMMIT;
