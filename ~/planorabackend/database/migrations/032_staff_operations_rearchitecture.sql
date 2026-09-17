BEGIN;

-- ============================================================
-- PLANORAHUB STAFF OPERATIONS RE-ARCHITECTURE
-- Rerunnable migration for existing databases as well as fresh ones.
-- ============================================================

-- ============================================================
-- STAFF OPERATIONS HIERARCHY
-- Department -> Staff -> optional cross-department Teams
-- ============================================================

ALTER TABLE teams
  ALTER COLUMN department_id DROP NOT NULL;

-- Older schema created this as a UNIQUE CONSTRAINT, not a plain index.
ALTER TABLE teams
  DROP CONSTRAINT IF EXISTS teams_department_id_name_key;

-- If an environment happened to have a standalone index with the old name,
-- remove it too. This is safe after dropping the constraint above.
DROP INDEX IF EXISTS teams_department_id_name_key;

-- Team names are company-wide because Teams may span Departments.
CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_name_active
  ON teams (LOWER(name))
  WHERE is_active = true;


-- ============================================================
-- REVENUE + TEAM OWNERSHIP ON LEADS
-- ============================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS proposed_revenue numeric(16,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue_probability numeric(5,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS actual_revenue numeric(16,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_team_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS claimed_by_id uuid;

-- Existing records get sensible commercial defaults.
UPDATE leads
SET proposed_revenue = 1000000
WHERE proposed_revenue IS NULL;

UPDATE leads
SET revenue_probability = 30
WHERE revenue_probability IS NULL;

ALTER TABLE leads
  ALTER COLUMN proposed_revenue SET DEFAULT 1000000,
  ALTER COLUMN proposed_revenue SET NOT NULL,
  ALTER COLUMN revenue_probability SET DEFAULT 30,
  ALTER COLUMN revenue_probability SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_revenue_probability_range'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_revenue_probability_range
      CHECK (revenue_probability >= 0 AND revenue_probability <= 100);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_assigned_team_id_fkey'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_assigned_team_id_fkey
      FOREIGN KEY (assigned_team_id)
      REFERENCES teams(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_claimed_by_id_fkey'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_claimed_by_id_fkey
      FOREIGN KEY (claimed_by_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_team
  ON leads(assigned_team_id);

CREATE INDEX IF NOT EXISTS idx_leads_pool
  ON leads(record_type, assigned_to_id, assigned_team_id, stage);


-- ============================================================
-- OFFICIAL LETTER APPROVAL WORKFLOW
-- ============================================================

ALTER TABLE letter_documents ADD COLUMN IF NOT EXISTS approval_status varchar(30);
ALTER TABLE letter_documents ADD COLUMN IF NOT EXISTS submitted_for_approval_at timestamptz;
ALTER TABLE letter_documents ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE letter_documents ADD COLUMN IF NOT EXISTS approved_by_id uuid;
ALTER TABLE letter_documents ADD COLUMN IF NOT EXISTS approval_note text;
ALTER TABLE letter_documents ADD COLUMN IF NOT EXISTS version_no integer;

UPDATE letter_documents
SET approval_status = 'DRAFT'
WHERE approval_status IS NULL;

UPDATE letter_documents
SET version_no = 1
WHERE version_no IS NULL;

ALTER TABLE letter_documents
  ALTER COLUMN approval_status SET DEFAULT 'DRAFT',
  ALTER COLUMN approval_status SET NOT NULL,
  ALTER COLUMN version_no SET DEFAULT 1,
  ALTER COLUMN version_no SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'letter_documents_approved_by_id_fkey'
      AND conrelid = 'letter_documents'::regclass
  ) THEN
    ALTER TABLE letter_documents
      ADD CONSTRAINT letter_documents_approved_by_id_fkey
      FOREIGN KEY (approved_by_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS letter_approval_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(10) NOT NULL,
  subject_id uuid NOT NULL,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_type, subject_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'letter_approval_exemptions_subject_type_check'
      AND conrelid = 'letter_approval_exemptions'::regclass
  ) THEN
    ALTER TABLE letter_approval_exemptions
      ADD CONSTRAINT letter_approval_exemptions_subject_type_check
      CHECK (subject_type IN ('STAFF', 'TEAM'));
  END IF;
END
$$;


-- ============================================================
-- SHARED FOLDER / FILE WORKSPACE
-- CREATE TABLE IF NOT EXISTS does not upgrade an existing table,
-- so every new field is also added explicitly below.
-- ============================================================

CREATE TABLE IF NOT EXISTS shared_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid,
  name varchar(180) NOT NULL,
  description text,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility varchar(24) NOT NULL DEFAULT 'PRIVATE',
  visibility_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  publication_status varchar(20) NOT NULL DEFAULT 'PUBLISHED',
  approved_by_id uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS visibility varchar(24);
ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS visibility_ids uuid[];
ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS publication_status varchar(20);
ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS approved_by_id uuid;
ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE shared_folders ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE shared_folders SET visibility = 'PRIVATE' WHERE visibility IS NULL;
UPDATE shared_folders SET visibility_ids = '{}'::uuid[] WHERE visibility_ids IS NULL;
UPDATE shared_folders SET publication_status = 'PUBLISHED' WHERE publication_status IS NULL;
UPDATE shared_folders SET created_at = now() WHERE created_at IS NULL;
UPDATE shared_folders SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE shared_folders
  ALTER COLUMN visibility SET DEFAULT 'PRIVATE',
  ALTER COLUMN visibility SET NOT NULL,
  ALTER COLUMN visibility_ids SET DEFAULT '{}'::uuid[],
  ALTER COLUMN visibility_ids SET NOT NULL,
  ALTER COLUMN publication_status SET DEFAULT 'PUBLISHED',
  ALTER COLUMN publication_status SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shared_folders_parent_id_fkey'
      AND conrelid = 'shared_folders'::regclass
  ) THEN
    ALTER TABLE shared_folders
      ADD CONSTRAINT shared_folders_parent_id_fkey
      FOREIGN KEY (parent_id)
      REFERENCES shared_folders(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shared_folders_approved_by_id_fkey'
      AND conrelid = 'shared_folders'::regclass
  ) THEN
    ALTER TABLE shared_folders
      ADD CONSTRAINT shared_folders_approved_by_id_fkey
      FOREIGN KEY (approved_by_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shared_folders_visibility_check'
      AND conrelid = 'shared_folders'::regclass
  ) THEN
    ALTER TABLE shared_folders
      ADD CONSTRAINT shared_folders_visibility_check
      CHECK (visibility IN ('PRIVATE','EVERYONE','SELECTED','DEPARTMENT','TEAM','LEAD','TASK'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shared_folders_publication_status_check'
      AND conrelid = 'shared_folders'::regclass
  ) THEN
    ALTER TABLE shared_folders
      ADD CONSTRAINT shared_folders_publication_status_check
      CHECK (publication_status IN ('DRAFT','PENDING','PUBLISHED','REJECTED'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS shared_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'task-attachments',
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS folder_id uuid;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS storage_bucket text;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE shared_files ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE shared_files SET storage_bucket = 'task-attachments' WHERE storage_bucket IS NULL;
UPDATE shared_files SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE shared_files
  ALTER COLUMN storage_bucket SET DEFAULT 'task-attachments',
  ALTER COLUMN storage_bucket SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shared_files_folder_id_fkey'
      AND conrelid = 'shared_files'::regclass
  ) THEN
    ALTER TABLE shared_files
      ADD CONSTRAINT shared_files_folder_id_fkey
      FOREIGN KEY (folder_id)
      REFERENCES shared_folders(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_shared_folders_parent
  ON shared_folders(parent_id);

CREATE INDEX IF NOT EXISTS idx_shared_files_folder
  ON shared_files(folder_id);


-- ============================================================
-- ACCESS CONTROL
-- Keep stationery configuration separate from writing letters.
-- ============================================================

INSERT INTO permissions(code,name,module,description) VALUES
 ('leads.claim','Pick Leads from Lead Pool','leads','Claim an available Lead from the shared Lead Pool.'),
 ('shared_files.read','View shared files','files','View files shared with the user.'),
 ('shared_files.create','Create shared folders and files','files','Create folders and upload files.'),
 ('shared_files.approve','Approve company shared files','files','Approve staff folders for wider publication.'),
 ('letters.write','Create official letters','letters','Create, edit and submit official correspondence.'),
 ('letters.approve','Approve official letters','letters','Approve or request changes to official correspondence.'),
 ('tasks.attachments.upload','Upload task attachments','tasks','Upload supporting files to tasks from administrative task routes.'),
 ('tasks.attachments.delete','Delete task attachments','tasks','Delete task attachments from administrative task routes.')
ON CONFLICT(code) DO NOTHING;

-- Super Admin receives the complete Staff Operations permission set.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code='SUPER_ADMIN'
  AND p.code IN(
    'leads.claim',
    'shared_files.read',
    'shared_files.create',
    'shared_files.approve',
    'letters.write',
    'letters.approve',
    'tasks.attachments.upload',
    'tasks.attachments.delete'
  )
ON CONFLICT DO NOTHING;

-- Ordinary roles can work with the Lead Pool, Shared Files and letter drafts.
-- They are NOT granted letterhead.manage (company stationery settings) or
-- approval permissions here.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code<>'SUPER_ADMIN'
  AND p.code IN(
    'leads.claim',
    'shared_files.read',
    'shared_files.create',
    'letters.write'
  )
ON CONFLICT DO NOTHING;

COMMIT;
