BEGIN;

-- ============================================================
-- P25: CRM MAIL WORKSPACE
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_mail_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject varchar(300) NOT NULL,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  recipient_emails text[] NOT NULL DEFAULT '{}'::text[],
  cc_emails text[] NOT NULL DEFAULT '{}'::text[],
  sender_label varchar(180),
  status varchar(20) NOT NULL DEFAULT 'OPEN',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_mail_threads_created_by
  ON crm_mail_threads(created_by_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_mail_threads_lead
  ON crm_mail_threads(lead_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_mail_threads_team
  ON crm_mail_threads(team_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS crm_mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES crm_mail_threads(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  direction varchar(16) NOT NULL DEFAULT 'OUTBOUND',
  provider_email_id text,
  provider_message_id text,
  from_email text,
  to_emails text[] NOT NULL DEFAULT '{}'::text[],
  cc_emails text[] NOT NULL DEFAULT '{}'::text[],
  subject varchar(300) NOT NULL,
  body_text text,
  delivery_status varchar(30) NOT NULL DEFAULT 'SENT',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_mail_messages_direction_check'
      AND conrelid = 'crm_mail_messages'::regclass
  ) THEN
    ALTER TABLE crm_mail_messages
      ADD CONSTRAINT crm_mail_messages_direction_check
      CHECK (direction IN ('OUTBOUND','INBOUND'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_crm_mail_messages_thread
  ON crm_mail_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_mail_messages_provider
  ON crm_mail_messages(provider_email_id);

CREATE TABLE IF NOT EXISTS crm_mail_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES crm_mail_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'task-attachments',
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_mail_attachments_message
  ON crm_mail_attachments(message_id);

CREATE TABLE IF NOT EXISTS crm_mail_thread_access (
  thread_id uuid NOT NULL REFERENCES crm_mail_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

-- ============================================================
-- P25: SHARED FILE ACCESS CONTROL
-- Multiple Staff / Department / Team / Role grants can coexist.
-- File-level access supplements folder access when inheritance is enabled.
-- ============================================================

ALTER TABLE shared_files
  ADD COLUMN IF NOT EXISTS inherit_folder_access boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS shared_item_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type varchar(12) NOT NULL,
  item_id uuid NOT NULL,
  subject_type varchar(20) NOT NULL,
  subject_id uuid NOT NULL,
  can_manage boolean NOT NULL DEFAULT false,
  granted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_type, item_id, subject_type, subject_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shared_item_access_item_type_check'
      AND conrelid = 'shared_item_access'::regclass
  ) THEN
    ALTER TABLE shared_item_access
      ADD CONSTRAINT shared_item_access_item_type_check
      CHECK (item_type IN ('FOLDER','FILE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shared_item_access_subject_type_check'
      AND conrelid = 'shared_item_access'::regclass
  ) THEN
    ALTER TABLE shared_item_access
      ADD CONSTRAINT shared_item_access_subject_type_check
      CHECK (subject_type IN ('STAFF','DEPARTMENT','TEAM','ROLE'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_shared_item_access_item
  ON shared_item_access(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_shared_item_access_subject
  ON shared_item_access(subject_type, subject_id);

-- ============================================================
-- P25: PERMISSIONS
-- ============================================================

INSERT INTO permissions(code,name,module,description) VALUES
 ('activities.read.all','View latest operational activities','activities','View the company-wide Leads, Prospects, Tasks and Clients activity stream.'),
 ('mail.send','Send CRM email','communications','Compose and send PlanoraHub branded CRM email.'),
 ('mail.manage','Manage all CRM email','communications','View all CRM mail threads and grant thread access.'),
 ('shared_files.manage_access','Manage shared file access','files','Change Staff, Department, Team and Role access for shared folders and files.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  module=EXCLUDED.module,
  description=EXCLUDED.description;

-- Super Admin receives every permission by convention; also seed explicitly
-- for installations whose role-permission sync has not been re-run.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code='SUPER_ADMIN'
  AND p.code IN ('activities.read.all','mail.send','mail.manage','shared_files.manage_access')
ON CONFLICT DO NOTHING;

-- Marketing remains the built-in operational staff role. Mail sending and
-- shared workspace access are sensible defaults; wider access is role-managed.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r JOIN permissions p ON p.code IN ('mail.send','shared_files.read','shared_files.create','shared_files.manage_access')
WHERE r.code='MARKETING'
ON CONFLICT DO NOTHING;

COMMIT;
