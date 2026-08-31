BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_method_type') THEN
    CREATE TYPE contact_method_type AS ENUM (
      'EMAIL', 'PHONE', 'LINKEDIN', 'X', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_method_verification_status') THEN
    CREATE TYPE contact_method_verification_status AS ENUM (
      'UNVERIFIED', 'VERIFIED', 'INVALID'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contact_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type contact_method_type NOT NULL,
  value VARCHAR(500) NOT NULL,
  label VARCHAR(120),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status contact_method_verification_status NOT NULL DEFAULT 'UNVERIFIED',
  notes TEXT,
  legacy_source VARCHAR(20),
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contact_methods_value_not_blank CHECK (BTRIM(value) <> ''),
  CONSTRAINT contact_methods_legacy_source_valid CHECK (
    legacy_source IS NULL OR legacy_source IN ('CONTACT_EMAIL', 'CONTACT_PHONE')
  )
);

CREATE INDEX IF NOT EXISTS idx_contact_methods_contact
  ON contact_methods(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_methods_type
  ON contact_methods(type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_methods_unique_value
  ON contact_methods(contact_id, type, LOWER(value));

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_methods_one_primary_per_type
  ON contact_methods(contact_id, type)
  WHERE is_primary = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_methods_one_legacy_source
  ON contact_methods(contact_id, legacy_source)
  WHERE legacy_source IS NOT NULL;

INSERT INTO contact_methods (contact_id, type, value, is_primary, verification_status, legacy_source, created_by_id)
SELECT id, 'EMAIL'::contact_method_type, BTRIM(email), TRUE,
  'UNVERIFIED'::contact_method_verification_status, 'CONTACT_EMAIL', created_by_id
FROM contacts
WHERE email IS NOT NULL AND BTRIM(email) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO contact_methods (contact_id, type, value, is_primary, verification_status, legacy_source, created_by_id)
SELECT id, 'PHONE'::contact_method_type, BTRIM(phone), TRUE,
  'UNVERIFIED'::contact_method_verification_status, 'CONTACT_PHONE', created_by_id
FROM contacts
WHERE phone IS NOT NULL AND BTRIM(phone) <> ''
ON CONFLICT DO NOTHING;

COMMIT;
