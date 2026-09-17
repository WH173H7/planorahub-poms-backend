BEGIN;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Keep Super Admin as the protected platform administrator and Marketing as the
-- only built-in assignable staff role. Legacy seeded roles remain valid for
-- existing users but are archived so they are not offered for new staff.
UPDATE roles
SET
  name = 'Marketing',
  description = 'Built-in marketing staff role. Its permissions can be reviewed by the Super Admin.',
  is_active = TRUE,
  updated_at = NOW()
WHERE code = 'MARKETING';

UPDATE roles
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE code IN (
  'OPERATIONS_MANAGER',
  'SALES_MANAGER',
  'SALES_EXECUTIVE',
  'CUSTOMER_SUCCESS',
  'FINANCE',
  'GENERAL_STAFF'
);

UPDATE roles
SET is_active = TRUE, updated_at = NOW()
WHERE code = 'SUPER_ADMIN';

CREATE INDEX IF NOT EXISTS idx_roles_active
ON roles(is_active);

COMMIT;
