BEGIN;

-- ============================================================
-- P27: MESSENGER GROUP CHAT + READ STATE
-- ============================================================

ALTER TABLE internal_chat_channels ADD COLUMN IF NOT EXISTS channel_type varchar(20);
ALTER TABLE internal_chat_channels ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE internal_chat_channels ADD COLUMN IF NOT EXISTS team_id uuid;
ALTER TABLE internal_chat_channels ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE internal_chat_channels
SET channel_type = CASE WHEN name='General' THEN 'COMPANY' ELSE 'CUSTOM' END
WHERE channel_type IS NULL;
UPDATE internal_chat_channels SET updated_at=COALESCE(updated_at,created_at,NOW()) WHERE updated_at IS NULL;

ALTER TABLE internal_chat_channels
  ALTER COLUMN channel_type SET DEFAULT 'CUSTOM',
  ALTER COLUMN channel_type SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='internal_chat_channels_channel_type_check'
      AND conrelid='internal_chat_channels'::regclass
  ) THEN
    ALTER TABLE internal_chat_channels DROP CONSTRAINT internal_chat_channels_channel_type_check;
  END IF;
  ALTER TABLE internal_chat_channels
    ADD CONSTRAINT internal_chat_channels_channel_type_check
    CHECK (channel_type IN ('COMPANY','DEPARTMENT','TEAM','CUSTOM','ADMIN'));

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='internal_chat_channels_department_id_fkey'
      AND conrelid='internal_chat_channels'::regclass
  ) THEN
    ALTER TABLE internal_chat_channels
      ADD CONSTRAINT internal_chat_channels_department_id_fkey
      FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='internal_chat_channels_team_id_fkey'
      AND conrelid='internal_chat_channels'::regclass
  ) THEN
    ALTER TABLE internal_chat_channels
      ADD CONSTRAINT internal_chat_channels_team_id_fkey
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_chat_department_channel
  ON internal_chat_channels(department_id)
  WHERE channel_type='DEPARTMENT' AND department_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_chat_team_channel
  ON internal_chat_channels(team_id)
  WHERE channel_type='TEAM' AND team_id IS NOT NULL;

-- Automatically create the department/team rooms that exist today. The service
-- also syncs newly-created structures on each channel listing.
INSERT INTO internal_chat_channels(name,description,visibility,channel_type,department_id)
SELECT 'Department · '||d.name,
       'Department group chat for '||d.name||'.',
       'ALL_STAFF','DEPARTMENT',d.id
FROM departments d
WHERE d.is_active=TRUE
ON CONFLICT DO NOTHING;

INSERT INTO internal_chat_channels(name,description,visibility,channel_type,team_id)
SELECT 'Team · '||t.name,
       'Team group chat for '||t.name||'.',
       'ALL_STAFF','TEAM',t.id
FROM teams t
WHERE t.is_active=TRUE
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS internal_chat_channel_reads (
  channel_id uuid NOT NULL REFERENCES internal_chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(channel_id,user_id)
);

ALTER TABLE internal_chat_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid;
ALTER TABLE internal_chat_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='internal_chat_messages_reply_to_id_fkey'
      AND conrelid='internal_chat_messages'::regclass
  ) THEN
    ALTER TABLE internal_chat_messages
      ADD CONSTRAINT internal_chat_messages_reply_to_id_fkey
      FOREIGN KEY(reply_to_id) REFERENCES internal_chat_messages(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS internal_chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES internal_chat_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'task-attachments',
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_internal_chat_attachments_message
  ON internal_chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_internal_chat_messages_unread
  ON internal_chat_messages(channel_id,created_at DESC,deleted_at);

-- ============================================================
-- P27: OFFICIAL LETTER STATIONERY FINAL VALUES
-- ============================================================
UPDATE letterhead_settings
SET email='partnership@mail.planorahub.app',
    website='www.planorahub.app',
    footer_text='PlanoraHub official correspondence',
    updated_at=NOW()
WHERE singleton_key='DEFAULT';

COMMIT;
