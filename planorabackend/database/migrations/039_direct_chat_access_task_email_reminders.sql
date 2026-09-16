BEGIN;

-- Additional direct-message relationships explicitly approved by Admin.
-- Super Admin access is implicit and does not need a row here.
CREATE TABLE IF NOT EXISTS staff_direct_message_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allowed_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (staff_user_id <> allowed_user_id),
  UNIQUE (staff_user_id, allowed_user_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_direct_message_grants_staff
  ON staff_direct_message_grants(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_direct_message_grants_allowed
  ON staff_direct_message_grants(allowed_user_id);

-- Delivery ledger makes the deadline worker idempotent across restarts/redeploys.
CREATE TABLE IF NOT EXISTS task_due_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_kind varchar(20) NOT NULL,
  due_at_snapshot timestamptz NOT NULL,
  email_status varchar(20) NOT NULL DEFAULT 'PENDING',
  email_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reminder_kind IN ('ONE_DAY','DUE')),
  CHECK (email_status IN ('PENDING','SENT','FAILED','SKIPPED')),
  UNIQUE (task_id, user_id, reminder_kind, due_at_snapshot)
);
CREATE INDEX IF NOT EXISTS idx_task_due_reminder_delivery_task
  ON task_due_reminder_deliveries(task_id, reminder_kind);

COMMIT;
