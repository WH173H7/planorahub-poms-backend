# P27.8 — Mail, deadline reminders, Messenger access and staff permissions

## Database migration
Run `planorabackend/database/migrations/039_direct_chat_access_task_email_reminders.sql` before deploying the backend.

It adds:
- `staff_direct_message_grants` for Admin-controlled staff-to-staff private chat access.
- `task_due_reminder_deliveries` to prevent duplicate deadline reminder emails across restarts.

## Mail workspace
- Added operational summary cards for conversations, replies, drafts and Resend delivery state.
- Polished folder rail, search, mail list, conversation reader and empty state.
- Existing compose, templates, drafts, shared access and Resend behavior are preserved.

## Task deadline reminders
A backend worker checks every five minutes and sends both in-app and email reminders:
- once when a task enters the final 24 hours before its due time;
- once when the task reaches/passes its due time.

Recipients include the task's active assigned staff/team/department members and active Super Admin accounts. Completed, cancelled and paused tasks are excluded. The delivery ledger is keyed to the task's due-date snapshot, so changing the due date allows the correct reminders for the new deadline without duplicating an old one.

Resend uses the existing `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. `CRM_TIMEZONE` is optional and defaults to `Africa/Lagos` for deadline text.

## Messenger access
- Super Admin can direct-message every active staff member.
- Normal staff see Super Admin in Direct by default.
- Normal staff see another staff member in Direct only when Admin grants that pair access.
- Existing team and department room membership rules remain unchanged.
- All five Messenger filters fit in the rail without horizontal scrolling.

## Staff creation / editing
- Permission browser was rebuilt without native disclosure rows; every module and permission is rendered explicitly to avoid the Safari thin-row issue.
- Staff creation includes optional additional Direct-message contacts. Super Admin remains implicit.
- Staff profile editing now has Profile & Structure and Permissions & Messaging tabs.
- Admin can update role-derived permission overrides and Direct-message grants for an existing staff member.
