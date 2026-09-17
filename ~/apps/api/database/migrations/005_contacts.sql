BEGIN;

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  job_title VARCHAR(160),

  email VARCHAR(255),
  phone VARCHAR(50),

  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,

  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_organization
  ON contacts(organization_id);

CREATE INDEX IF NOT EXISTS idx_contacts_email
  ON contacts(LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_one_primary_per_org
  ON contacts(organization_id)
  WHERE is_primary = TRUE;

INSERT INTO permissions (code, name, module, description)
VALUES
  (
    'contacts.read.all',
    'View contacts',
    'contacts',
    'View contacts linked to organizations.'
  ),
  (
    'contacts.create',
    'Create contacts',
    'contacts',
    'Create organization contacts.'
  ),
  (
    'contacts.update.all',
    'Update contacts',
    'contacts',
    'Edit organization contacts.'
  ),
  (
    'contacts.delete',
    'Delete contacts',
    'contacts',
    'Delete contacts from organization records.'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND p.code IN (
    'contacts.read.all',
    'contacts.create',
    'contacts.update.all',
    'contacts.delete'
  )
ON CONFLICT DO NOTHING;

COMMIT;
