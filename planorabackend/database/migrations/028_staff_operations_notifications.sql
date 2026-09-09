BEGIN;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(180) NOT NULL,
  body text,
  kind varchar(60) NOT NULL DEFAULT 'GENERAL',
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS direct_chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a_id <> user_b_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_chat_pair ON direct_chat_conversations(LEAST(user_a_id,user_b_id), GREATEST(user_a_id,user_b_id));
CREATE TABLE IF NOT EXISTS direct_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES direct_chat_conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_direct_chat_messages_conversation ON direct_chat_messages(conversation_id,created_at);

CREATE TABLE IF NOT EXISTS calendar_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  notes text,
  starts_at timestamptz NOT NULL,
  reminder_at timestamptz,
  related_type varchar(30),
  related_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_date ON calendar_reminders(user_id,starts_at);


CREATE OR REPLACE FUNCTION planorahub_notify_task_assignment() RETURNS trigger AS $$
BEGIN
  IF NEW.assigned_to_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.assigned_to_id IS DISTINCT FROM NEW.assigned_to_id) THEN
    INSERT INTO notifications(user_id,title,body,kind,href)
    VALUES(NEW.assigned_to_id,'Task assigned',NEW.title,'TASK_ASSIGNMENT','/tasks/'||NEW.id::text);
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_task_assignment ON tasks;
CREATE TRIGGER trg_notify_task_assignment AFTER INSERT OR UPDATE OF assigned_to_id ON tasks FOR EACH ROW EXECUTE FUNCTION planorahub_notify_task_assignment();

CREATE OR REPLACE FUNCTION planorahub_notify_lead_assignment() RETURNS trigger AS $$
DECLARE org_name text;
BEGIN
  IF NEW.assigned_to_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.assigned_to_id IS DISTINCT FROM NEW.assigned_to_id) THEN
    SELECT name INTO org_name FROM organizations WHERE id=NEW.organization_id;
    INSERT INTO notifications(user_id,title,body,kind,href)
    VALUES(NEW.assigned_to_id,'Lead assigned',COALESCE(org_name,'A lead was assigned to you'),'LEAD_ASSIGNMENT','/my-work/leads/'||NEW.id::text);
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_lead_assignment ON leads;
CREATE TRIGGER trg_notify_lead_assignment AFTER INSERT OR UPDATE OF assigned_to_id ON leads FOR EACH ROW EXECUTE FUNCTION planorahub_notify_lead_assignment();


CREATE OR REPLACE FUNCTION planorahub_notify_admin_task_update() RETURNS trigger AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('AWAITING_RESPONSE','COMPLETED') THEN
    INSERT INTO notifications(user_id,title,body,kind,href)
    SELECT u.id,CASE WHEN NEW.status='AWAITING_RESPONSE' THEN 'Task submitted for review' ELSE 'Task completed' END,NEW.title,'TASK_UPDATE','/tasks/'||NEW.id::text
    FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='SUPER_ADMIN' AND u.status='ACTIVE';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_admin_task_update ON tasks;
CREATE TRIGGER trg_notify_admin_task_update AFTER UPDATE OF status ON tasks FOR EACH ROW EXECUTE FUNCTION planorahub_notify_admin_task_update();

CREATE OR REPLACE FUNCTION planorahub_notify_admin_lead_update() RETURNS trigger AS $$
DECLARE org_name text;
BEGIN
  IF TG_OP='UPDATE' AND (OLD.stage IS DISTINCT FROM NEW.stage OR OLD.pursuit_progress IS DISTINCT FROM NEW.pursuit_progress) THEN
    SELECT name INTO org_name FROM organizations WHERE id=NEW.organization_id;
    INSERT INTO notifications(user_id,title,body,kind,href)
    SELECT u.id,'Lead updated',COALESCE(org_name,'Lead')||' · '||NEW.stage::text,'LEAD_UPDATE','/leads/'||NEW.id::text
    FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='SUPER_ADMIN' AND u.status='ACTIVE';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_admin_lead_update ON leads;
CREATE TRIGGER trg_notify_admin_lead_update AFTER UPDATE OF stage,pursuit_progress ON leads FOR EACH ROW EXECUTE FUNCTION planorahub_notify_admin_lead_update();

INSERT INTO permissions(code,name,module,description) VALUES
 ('departments.manage','Manage departments and teams','administration','Create and manage company departments and teams.'),
 ('notifications.read','View notifications','notifications','View personal operational notifications.')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='SUPER_ADMIN' AND p.code IN('departments.manage','notifications.read') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code<>'SUPER_ADMIN' AND p.code='notifications.read' ON CONFLICT DO NOTHING;

COMMIT;
