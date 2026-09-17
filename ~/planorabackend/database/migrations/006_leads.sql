BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'lead_stage'
  ) THEN
    CREATE TYPE lead_stage AS ENUM (
      'NEW',
      'CONTACTED',
      'INTERESTED',
      'DEMO_SCHEDULED',
      'PROPOSAL_SENT',
      'NEGOTIATION',
      'CONVERTED',
      'LOST'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,

  primary_contact_id UUID
    REFERENCES contacts(id) ON DELETE SET NULL,

  assigned_to_id UUID
    REFERENCES users(id) ON DELETE SET NULL,

  title VARCHAR(220) NOT NULL,
  source VARCHAR(140),
  stage lead_stage NOT NULL DEFAULT 'NEW',

  estimated_value NUMERIC(14,2),
  currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
  probability INTEGER CHECK (
    probability IS NULL OR
    (probability >= 0 AND probability <= 100)
  ),

  next_action TEXT,
  next_action_date TIMESTAMPTZ,
  expected_close_date DATE,

  lost_reason TEXT,
  notes TEXT,

  created_by_id UUID
    REFERENCES users(id) ON DELETE SET NULL,

  converted_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_organization
  ON leads(organization_id);

CREATE INDEX IF NOT EXISTS idx_leads_stage
  ON leads(stage);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to
  ON leads(assigned_to_id);

CREATE INDEX IF NOT EXISTS idx_leads_expected_close
  ON leads(expected_close_date);

INSERT INTO permissions (code, name, module, description)
VALUES
  (
    'leads.read.all',
    'View all leads',
    'leads',
    'View sales leads and opportunities.'
  ),
  (
    'leads.create',
    'Create leads',
    'leads',
    'Create sales leads and opportunities.'
  ),
  (
    'leads.update.all',
    'Update leads',
    'leads',
    'Update sales lead details and stages.'
  ),
  (
    'leads.convert',
    'Convert leads',
    'leads',
    'Mark leads as converted customers.'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND p.code IN (
    'leads.read.all',
    'leads.create',
    'leads.update.all',
    'leads.convert'
  )
ON CONFLICT DO NOTHING;

COMMIT;
