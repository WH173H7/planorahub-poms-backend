BEGIN;

-- ============================================================
-- P25.1: Repair shared_files on installations where the table
-- pre-dated migration 032 and therefore missed newer columns.
-- ============================================================
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS created_by_id uuid;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS storage_bucket text;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS inherit_folder_access boolean NOT NULL DEFAULT true;

UPDATE shared_files sf
SET created_by_id = f.created_by_id
FROM shared_folders f
WHERE sf.folder_id=f.id AND sf.created_by_id IS NULL;

UPDATE shared_files SET storage_bucket='task-attachments' WHERE storage_bucket IS NULL;
UPDATE shared_files SET created_at=now() WHERE created_at IS NULL;
UPDATE shared_files SET file_size=0 WHERE file_size IS NULL;

ALTER TABLE shared_files
  ALTER COLUMN storage_bucket SET DEFAULT 'task-attachments',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN file_size SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='shared_files_created_by_id_fkey'
      AND conrelid='shared_files'::regclass
  ) THEN
    ALTER TABLE shared_files
      ADD CONSTRAINT shared_files_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_shared_files_created_by ON shared_files(created_by_id);

-- ============================================================
-- CRM mail drafts
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_mail_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_label varchar(180),
  recipient_emails text[] NOT NULL DEFAULT '{}'::text[],
  cc_emails text[] NOT NULL DEFAULT '{}'::text[],
  subject varchar(300) NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  template_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_mail_drafts_creator
  ON crm_mail_drafts(created_by_id, updated_at DESC);

-- ============================================================
-- CRM mail templates
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_mail_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  description text,
  html text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_mail_templates_default
  ON crm_mail_templates((is_default)) WHERE is_default=true;


ALTER TABLE crm_mail_threads ADD COLUMN IF NOT EXISTS template_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='crm_mail_threads_template_id_fkey'
      AND conrelid='crm_mail_threads'::regclass
  ) THEN
    ALTER TABLE crm_mail_threads
      ADD CONSTRAINT crm_mail_threads_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES crm_mail_templates(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='crm_mail_drafts' AND column_name='template_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='crm_mail_drafts_template_id_fkey'
      AND conrelid='crm_mail_drafts'::regclass
  ) THEN
    ALTER TABLE crm_mail_drafts
      ADD CONSTRAINT crm_mail_drafts_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES crm_mail_templates(id) ON DELETE SET NULL;
  END IF;
END
$$;

INSERT INTO crm_mail_templates(name,description,html,is_default,is_active)
SELECT
  'PlanoraHub Standard',
  'Default PlanoraHub branded email layout used for CRM correspondence.',
  '<!doctype html><html><body style="margin:0;background:#f4f1f5;font-family:Inter,Arial,sans-serif;color:#211d22"><div style="max-width:680px;margin:0 auto;padding:30px 16px"><div style="background:#ffffff;border:1px solid #e8dde9;border-radius:18px;overflow:hidden"><div style="height:5px;background:linear-gradient(90deg,#5b1769,#8b3f99,#c994d2)"></div><div style="padding:24px 28px 18px"><div style="border-bottom:1px solid #eee7ef;padding-bottom:18px;margin-bottom:22px"><div style="font-size:20px;font-weight:800;color:#541961">PlanoraHub</div><div style="color:#8a808b;font-size:12px">{{sender}}</div></div><div style="font-size:15px;line-height:1.75;color:#352f37">{{body}}</div><div style="border-top:1px solid #eee7ef;margin-top:26px;padding-top:16px;color:#8a808b;font-size:11px;line-height:1.6">This message was sent through PlanoraHub CRM. Please reply to continue the conversation.</div></div></div><p style="text-align:center;color:#958b97;font-size:11px;margin:14px 0 0">PlanoraHub · Business Operations</p></div></body></html>',
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM crm_mail_templates WHERE is_default=true);

INSERT INTO permissions(code,name,module,description) VALUES
 ('mail.templates.manage','Manage CRM mail templates','communications','Create, edit and activate HTML templates for PlanoraHub CRM mail.')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,module=EXCLUDED.module,description=EXCLUDED.description;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='mail.templates.manage'
WHERE r.code='SUPER_ADMIN'
ON CONFLICT DO NOTHING;

COMMIT;
