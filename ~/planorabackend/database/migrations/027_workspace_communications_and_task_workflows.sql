BEGIN;

CREATE TABLE IF NOT EXISTS task_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES task_workflows(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  guidance TEXT,
  requires_evidence BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, position)
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_workflow_id UUID REFERENCES task_workflows(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_task_workflow ON tasks(task_workflow_id);

CREATE TABLE IF NOT EXISTS task_workflow_progress (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES task_workflow_steps(id) ON DELETE CASCADE,
  completed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, step_id)
);

CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100),
  subject VARCHAR(240),
  body TEXT NOT NULL,
  usage_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  visibility VARCHAR(20) NOT NULL DEFAULT 'ALL_STAFF' CHECK (visibility IN ('ALL_STAFF','ADMIN_ONLY')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES internal_chat_channels(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_internal_chat_messages_channel ON internal_chat_messages(channel_id, created_at DESC);

INSERT INTO internal_chat_channels (name, description, visibility)
VALUES ('General', 'Company-wide PlanoraHub staff channel.', 'ALL_STAFF')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS google_mail_connections (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email VARCHAR(255),
  encrypted_refresh_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  scope TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS letterhead_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key VARCHAR(30) NOT NULL UNIQUE DEFAULT 'DEFAULT',
  organization_name VARCHAR(180) NOT NULL DEFAULT 'PlanoraHub',
  tagline VARCHAR(240),
  address TEXT,
  email VARCHAR(255),
  phone VARCHAR(80),
  website VARCHAR(255),
  footer_text TEXT,
  signatory_name VARCHAR(160),
  signatory_title VARCHAR(160),
  updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO letterhead_settings (singleton_key, organization_name)
VALUES ('DEFAULT', 'PlanoraHub')
ON CONFLICT (singleton_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS letter_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(220) NOT NULL,
  reference_number VARCHAR(120),
  letter_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recipient_name VARCHAR(180),
  recipient_organization VARCHAR(180),
  recipient_address TEXT,
  subject VARCHAR(240),
  body TEXT NOT NULL,
  closing VARCHAR(100) NOT NULL DEFAULT 'Yours faithfully,',
  signatory_name VARCHAR(160),
  signatory_title VARCHAR(160),
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permissions (code, name, module, description)
VALUES
  ('task_workflows.read', 'View task workflows', 'task_workflows', 'View reusable task workflow guides.'),
  ('task_workflows.manage', 'Manage task workflows', 'task_workflows', 'Create and maintain reusable task workflow guides.'),
  ('templates.read', 'View communication templates', 'communications', 'View company communication templates.'),
  ('templates.manage', 'Manage communication templates', 'communications', 'Create and maintain company communication templates.'),
  ('chat.read', 'View internal chat', 'communications', 'View company internal chat channels.'),
  ('chat.send', 'Send internal chat messages', 'communications', 'Send messages in company internal chat.'),
  ('chat.manage', 'Manage internal chat', 'communications', 'Create or manage internal chat channels.'),
  ('gmail.use', 'Use connected Gmail', 'communications', 'Connect and use a Google Workspace or Gmail mailbox inside POMS.'),
  ('letterhead.read', 'View letterhead documents', 'communications', 'View company letterhead settings and drafts.'),
  ('letterhead.manage', 'Manage letterhead', 'communications', 'Configure letterhead and create official letters.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('task_workflows.read','templates.read','chat.read','chat.send','gmail.use','letterhead.read')
WHERE r.code IN ('OPERATIONS_MANAGER','SALES_MANAGER','SALES_EXECUTIVE','CUSTOMER_SUCCESS','MARKETING','FINANCE','GENERAL_STAFF')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('task_workflows.manage','templates.manage','chat.manage','letterhead.manage','reports.read','reports.export')
WHERE r.code IN ('OPERATIONS_MANAGER','SALES_MANAGER')
ON CONFLICT DO NOTHING;

COMMIT;
