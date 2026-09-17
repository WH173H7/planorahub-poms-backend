BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE activity_type AS ENUM (
      'CALL',
      'MEETING',
      'EMAIL',
      'FOLLOW_UP',
      'NOTE',
      'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_status') THEN
    CREATE TYPE activity_status AS ENUM (
      'PLANNED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(220) NOT NULL,
  activity_type activity_type NOT NULL DEFAULT 'FOLLOW_UP',
  status activity_status NOT NULL DEFAULT 'PLANNED',
  description TEXT,
  outcome TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_status
  ON activities(status);

CREATE INDEX IF NOT EXISTS idx_activities_type
  ON activities(activity_type);

CREATE INDEX IF NOT EXISTS idx_activities_organization
  ON activities(organization_id);

CREATE INDEX IF NOT EXISTS idx_activities_contact
  ON activities(contact_id);

CREATE INDEX IF NOT EXISTS idx_activities_lead
  ON activities(lead_id);

CREATE INDEX IF NOT EXISTS idx_activities_assigned_to
  ON activities(assigned_to_id);

CREATE INDEX IF NOT EXISTS idx_activities_scheduled_at
  ON activities(scheduled_at);

INSERT INTO permissions (code, name, module, description)
VALUES
  ('activities.read.all', 'View all activities', 'activities', 'View CRM activities across the organization.'),
  ('activities.create', 'Create activities', 'activities', 'Log calls, meetings, emails, follow-ups, notes and other activities.'),
  ('activities.update.all', 'Update all activities', 'activities', 'Edit activity details, assignment and scheduling.'),
  ('activities.complete', 'Complete activities', 'activities', 'Mark an activity as completed and record its outcome.'),
  ('activities.delete', 'Delete activities', 'activities', 'Delete CRM activities.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND p.code IN (
    'activities.read.all',
    'activities.create',
    'activities.update.all',
    'activities.complete',
    'activities.delete'
  )
ON CONFLICT DO NOTHING;

COMMIT;
