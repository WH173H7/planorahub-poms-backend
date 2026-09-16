BEGIN;

-- Preserve who performed an action even if the staff account is later deleted.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS actor_name_snapshot varchar(220),
  ADD COLUMN IF NOT EXISTS actor_email_snapshot varchar(320),
  ADD COLUMN IF NOT EXISTS actor_role_snapshot varchar(180),
  ADD COLUMN IF NOT EXISTS actor_department_snapshot varchar(180);

-- Backfill the identity context we can still resolve for existing audit rows.
UPDATE audit_logs al
SET
  actor_user_id_snapshot = COALESCE(al.actor_user_id_snapshot, al.actor_user_id),
  actor_name_snapshot = COALESCE(
    al.actor_name_snapshot,
    NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '')
  ),
  actor_email_snapshot = COALESCE(al.actor_email_snapshot, u.email),
  actor_role_snapshot = COALESCE(al.actor_role_snapshot, r.name),
  actor_department_snapshot = COALESCE(al.actor_department_snapshot, d.name)
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
LEFT JOIN departments d ON d.id = u.department_id
WHERE al.actor_user_id = u.id;

CREATE INDEX IF NOT EXISTS idx_audit_action_created_at
  ON audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor_created_at
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor_snapshot_created_at
  ON audit_logs(actor_user_id_snapshot, created_at DESC);

COMMIT;
