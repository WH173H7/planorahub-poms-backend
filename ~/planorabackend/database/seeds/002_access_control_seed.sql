BEGIN;

-- =========================
-- SYSTEM ROLES
-- =========================

INSERT INTO roles (code, name, description, is_system_role)
VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Protected platform administrator with full access.', TRUE),
  ('MARKETING', 'Marketing', 'Built-in marketing staff role. Additional staff roles are created by the Super Admin.', TRUE)
ON CONFLICT (code) DO NOTHING;


-- =========================
-- USER / TEAM PERMISSIONS
-- =========================

INSERT INTO permissions (code, name, module, description)
VALUES
  ('users.read.own', 'View own profile', 'users', 'View own staff profile.'),
  ('users.read.team', 'View team staff', 'users', 'View users within the same managed team.'),
  ('users.read.all', 'View all staff', 'users', 'View all POMS users.'),

  ('users.create', 'Create staff', 'users', 'Create new staff accounts.'),
  ('users.update.own', 'Update own profile', 'users', 'Update permitted own profile fields.'),
  ('users.update.team', 'Update team staff', 'users', 'Update permitted staff records within managed teams.'),
  ('users.update.all', 'Update all staff', 'users', 'Update staff across the company.'),

  ('users.suspend', 'Suspend staff', 'users', 'Suspend staff accounts.'),
  ('users.disable', 'Disable staff', 'users', 'Disable staff accounts.'),
  ('users.reset_password', 'Reset staff password', 'users', 'Issue password reset or temporary credentials.'),

  ('roles.read', 'View roles', 'roles', 'View system roles.'),
  ('roles.manage', 'Manage roles', 'roles', 'Create or modify non-protected role settings.'),

  ('permissions.read', 'View permissions', 'permissions', 'View permission catalog.'),
  ('permissions.manage', 'Manage permissions', 'permissions', 'Change role permissions and user-specific overrides.'),

  ('departments.read', 'View departments', 'departments', 'View company departments.'),
  ('departments.manage', 'Manage departments', 'departments', 'Create and update departments.'),

  ('teams.read.own', 'View own team', 'teams', 'View own team information.'),
  ('teams.read.all', 'View all teams', 'teams', 'View all company teams.'),
  ('teams.manage', 'Manage teams', 'teams', 'Create and modify teams and team membership.')
ON CONFLICT (code) DO NOTHING;


-- =========================
-- TASK PERMISSIONS
-- =========================

INSERT INTO permissions (code, name, module, description)
VALUES
  ('tasks.create', 'Create tasks', 'tasks', 'Create tasks.'),
  ('tasks.read.own', 'View own tasks', 'tasks', 'View tasks assigned to the current user.'),
  ('tasks.read.team', 'View team tasks', 'tasks', 'View tasks belonging to managed team members.'),
  ('tasks.read.all', 'View all tasks', 'tasks', 'View every task in POMS.'),

  ('tasks.update.own', 'Update own tasks', 'tasks', 'Update tasks assigned to the current user.'),
  ('tasks.update.team', 'Update team tasks', 'tasks', 'Update tasks within managed teams.'),
  ('tasks.update.all', 'Update all tasks', 'tasks', 'Update all company tasks.'),

  ('tasks.assign.team', 'Assign team tasks', 'tasks', 'Assign tasks within managed teams.'),
  ('tasks.assign.all', 'Assign any task', 'tasks', 'Assign tasks to any staff member.'),

  ('tasks.review.team', 'Review team tasks', 'tasks', 'Approve or reject submitted team tasks.'),
  ('tasks.review.all', 'Review all tasks', 'tasks', 'Approve or reject any submitted task.'),

  ('tasks.delete', 'Delete tasks', 'tasks', 'Delete tasks where deletion is permitted.')
ON CONFLICT (code) DO NOTHING;


-- =========================
-- LEAD / CRM PERMISSIONS
-- =========================

INSERT INTO permissions (code, name, module, description)
VALUES
  ('leads.create', 'Create leads', 'leads', 'Create CRM leads.'),

  ('leads.read.own', 'View own leads', 'leads', 'View leads assigned to the current user.'),
  ('leads.read.team', 'View team leads', 'leads', 'View leads assigned within managed teams.'),
  ('leads.read.all', 'View all leads', 'leads', 'View all company leads.'),

  ('leads.update.own', 'Update own leads', 'leads', 'Update assigned leads.'),
  ('leads.update.team', 'Update team leads', 'leads', 'Update leads within managed teams.'),
  ('leads.update.all', 'Update all leads', 'leads', 'Update all company leads.'),

  ('leads.assign.team', 'Assign team leads', 'leads', 'Assign leads within managed teams.'),
  ('leads.assign.all', 'Assign any lead', 'leads', 'Assign leads to any eligible staff member.'),

  ('leads.change_stage.own', 'Change own lead stage', 'leads', 'Move assigned leads through the CRM pipeline.'),
  ('leads.change_stage.team', 'Change team lead stage', 'leads', 'Move team-owned leads through stages.'),
  ('leads.change_stage.all', 'Change any lead stage', 'leads', 'Move any lead through CRM stages.'),

  ('leads.delete', 'Delete leads', 'leads', 'Delete leads where business rules permit.')
ON CONFLICT (code) DO NOTHING;


-- =========================
-- ACTIVITY PERMISSIONS
-- =========================

INSERT INTO permissions (code, name, module, description)
VALUES
  ('activities.create', 'Log activities', 'activities', 'Log calls, emails, WhatsApp, meetings, demos and follow-ups.'),

  ('activities.read.own', 'View own activities', 'activities', 'View activity recorded by the current user.'),
  ('activities.read.team', 'View team activities', 'activities', 'View activities within managed teams.'),
  ('activities.read.all', 'View all activities', 'activities', 'View all CRM activity.'),

  ('activities.update.own', 'Update own activities', 'activities', 'Update permitted own activity records.'),
  ('activities.update.all', 'Update all activities', 'activities', 'Update company activity records.')
ON CONFLICT (code) DO NOTHING;


-- =========================
-- ANALYTICS / AUDIT
-- =========================

INSERT INTO permissions (code, name, module, description)
VALUES
  ('analytics.read.own', 'View own analytics', 'analytics', 'View personal task, lead and performance analytics.'),
  ('analytics.read.team', 'View team analytics', 'analytics', 'View team performance analytics.'),
  ('analytics.read.all', 'View company analytics', 'analytics', 'View company-wide analytics.'),

  ('reports.read', 'View reports', 'reports', 'View available POMS reports.'),
  ('reports.export', 'Export reports', 'reports', 'Export authorized reports.'),

  ('audit.read.all', 'View audit logs', 'audit', 'View complete POMS audit history.')
ON CONFLICT (code) DO NOTHING;


-- =========================
-- SUPER ADMIN
-- gets every permission
-- =========================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;


-- =========================
-- OPERATIONS MANAGER
-- =========================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.read.team',
  'users.update.team',

  'departments.read',

  'teams.read.own',

  'tasks.create',
  'tasks.read.own',
  'tasks.read.team',
  'tasks.update.own',
  'tasks.update.team',
  'tasks.assign.team',
  'tasks.review.team',

  'leads.read.own',
  'leads.read.team',

  'activities.create',
  'activities.read.own',
  'activities.read.team',

  'analytics.read.own',
  'analytics.read.team',
  'reports.read'
)
WHERE r.code = 'OPERATIONS_MANAGER'
ON CONFLICT DO NOTHING;


-- =========================
-- SALES MANAGER
-- =========================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.read.team',
  'departments.read',
  'teams.read.own',

  'tasks.create',
  'tasks.read.own',
  'tasks.read.team',
  'tasks.update.own',
  'tasks.update.team',
  'tasks.assign.team',
  'tasks.review.team',

  'leads.create',
  'leads.read.own',
  'leads.read.team',
  'leads.update.own',
  'leads.update.team',
  'leads.assign.team',
  'leads.change_stage.own',
  'leads.change_stage.team',

  'activities.create',
  'activities.read.own',
  'activities.read.team',

  'analytics.read.own',
  'analytics.read.team',
  'reports.read'
)
WHERE r.code = 'SALES_MANAGER'
ON CONFLICT DO NOTHING;


-- =========================
-- SALES EXECUTIVE
-- =========================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.read.own',
  'users.update.own',
  'departments.read',
  'teams.read.own',

  'tasks.read.own',
  'tasks.update.own',

  'leads.create',
  'leads.read.own',
  'leads.update.own',
  'leads.change_stage.own',

  'activities.create',
  'activities.read.own',
  'activities.update.own',

  'analytics.read.own'
)
WHERE r.code = 'SALES_EXECUTIVE'
ON CONFLICT DO NOTHING;


-- =========================
-- GENERAL STAFF
-- =========================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.read.own',
  'users.update.own',
  'departments.read',
  'teams.read.own',

  'tasks.read.own',
  'tasks.update.own',

  'activities.create',
  'activities.read.own',

  'analytics.read.own'
)
WHERE r.code = 'GENERAL_STAFF'
ON CONFLICT DO NOTHING;


-- =========================
-- CUSTOMER SUCCESS
-- =========================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.read.own',
  'users.update.own',
  'departments.read',
  'teams.read.own',

  'tasks.read.own',
  'tasks.update.own',

  'leads.read.own',

  'activities.create',
  'activities.read.own',
  'activities.update.own',

  'analytics.read.own'
)
WHERE r.code = 'CUSTOMER_SUCCESS'
ON CONFLICT DO NOTHING;


-- =========================
-- MARKETING
-- =========================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.read.own',
  'users.update.own',

  'tasks.read.own',
  'tasks.update.own',

  'leads.create',
  'leads.read.own',
  'leads.update.own',

  'activities.create',
  'activities.read.own',

  'analytics.read.own'
)
WHERE r.code = 'MARKETING'
ON CONFLICT DO NOTHING;


-- =========================
-- FINANCE
-- initial base access
-- =========================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.read.own',
  'users.update.own',

  'tasks.read.own',
  'tasks.update.own',

  'analytics.read.own',
  'reports.read'
)
WHERE r.code = 'FINANCE'
ON CONFLICT DO NOTHING;

COMMIT;
