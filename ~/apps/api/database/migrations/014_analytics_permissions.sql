BEGIN;

INSERT INTO permissions (code, name, module, description)
VALUES
  (
    'analytics.read.all',
    'View organization analytics',
    'analytics',
    'View operational analytics across tasks, leads, organizations, activities and staff.'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND p.code = 'analytics.read.all'
ON CONFLICT DO NOTHING;

COMMIT;
