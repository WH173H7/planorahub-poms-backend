BEGIN;

ALTER TABLE direct_chat_messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE direct_chat_messages ADD COLUMN IF NOT EXISTS client_token varchar(120);
CREATE INDEX IF NOT EXISTS idx_direct_chat_unread ON direct_chat_messages(conversation_id,read_at,created_at DESC);

CREATE TABLE IF NOT EXISTS direct_chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES direct_chat_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'task-attachments',
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_direct_chat_attachments_message ON direct_chat_attachments(message_id);

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(180) NOT NULL,
  body text NOT NULL,
  priority varchar(20) NOT NULL DEFAULT 'NORMAL' CHECK(priority IN('NORMAL','IMPORTANT','URGENT')),
  channel varchar(20) NOT NULL DEFAULT 'IN_APP' CHECK(channel IN('IN_APP','EMAIL','BOTH')),
  audience_type varchar(30) NOT NULL DEFAULT 'EVERYONE' CHECK(audience_type IN('EVERYONE','DEPARTMENT','TEAM','ROLE','SELECTED')),
  audience_ids uuid[] NOT NULL DEFAULT '{}',
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES broadcasts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  in_app_sent_at timestamptz,
  email_status varchar(30) NOT NULL DEFAULT 'NOT_REQUESTED',
  read_at timestamptz,
  PRIMARY KEY(broadcast_id,user_id)
);

INSERT INTO permissions(code,name,module,description) VALUES
 ('broadcasts.manage','Manage broadcasts','communications','Create and track staff broadcasts.'),
 ('staff.permissions.manage','Manage staff permissions','administration','Manage effective staff access.')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='SUPER_ADMIN' AND p.code IN('broadcasts.manage','staff.permissions.manage')
ON CONFLICT DO NOTHING;

-- Promote organization-level lead contact channels into the central Contacts directory
-- only when an organization currently has no person/contact record.
INSERT INTO contacts(organization_id,first_name,last_name,job_title,email,phone,is_primary,notes)
SELECT o.id,o.name,'Office','General contact',o.email,o.phone,TRUE,'Created from the organization contact details captured with the Lead.'
FROM organizations o
WHERE (NULLIF(TRIM(o.email),'') IS NOT NULL OR NULLIF(TRIM(o.phone),'') IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM contacts c WHERE c.organization_id=o.id)
ON CONFLICT DO NOTHING;

COMMIT;
