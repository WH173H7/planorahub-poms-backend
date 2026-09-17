BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'organization_type'
  ) THEN
    CREATE TYPE organization_type AS ENUM (
      'PROSPECT',
      'CUSTOMER',
      'PARTNER',
      'OTHER'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'organization_status'
  ) THEN
    CREATE TYPE organization_status AS ENUM (
      'ACTIVE',
      'INACTIVE',
      'ARCHIVED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(180) NOT NULL,
  legal_name VARCHAR(220),
  organization_type organization_type NOT NULL DEFAULT 'PROSPECT',
  industry VARCHAR(140),

  email VARCHAR(255),
  phone VARCHAR(50),
  website TEXT,

  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(120),
  state VARCHAR(120),
  country VARCHAR(120),

  notes TEXT,

  assigned_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,

  status organization_status NOT NULL DEFAULT 'ACTIVE',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_name
  ON organizations (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_organizations_type
  ON organizations (organization_type);

CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON organizations (status);

CREATE INDEX IF NOT EXISTS idx_organizations_owner
  ON organizations (assigned_owner_id);

INSERT INTO permissions (code, name, module, description)
VALUES
  (
    'organizations.read.all',
    'View all organizations',
    'organizations',
    'View organizations, prospects, customers and partners.'
  ),
  (
    'organizations.create',
    'Create organizations',
    'organizations',
    'Create new organization records.'
  ),
  (
    'organizations.update.all',
    'Update organizations',
    'organizations',
    'Edit organization records.'
  ),
  (
    'organizations.archive',
    'Archive organizations',
    'organizations',
    'Archive or restore organization records.'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND p.code IN (
    'organizations.read.all',
    'organizations.create',
    'organizations.update.all',
    'organizations.archive'
  )
ON CONFLICT DO NOTHING;

COMMIT;
