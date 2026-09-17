# P27.10 — Consolidated pre-deploy polish + workforce structure details

This patch is cumulative on P27.8 and includes the P27.9 fixes plus the new workforce structure work.

## Included from P27.9
- Mobile notifications portal below the app topbar (no upward/off-screen panel).
- Mobile CRM search portal/full overlay so result cards no longer render through Dashboard content.
- Permission browser root fix: non-shrinking flex module stack instead of the compressed grid that Safari rendered as thin bars.
- Report CSV download handoff that asks Admin whether to send the same filtered report to their account email.
- Search request network failures handled without unhandled promise rejection.

## P27.10 workforce structure work
- Department cards now expose a polished View details workspace.
- Team cards now expose a polished View details workspace.
- Role edit/review workspace now shows operational footprint, assigned staff, departments, associations and recent activity.
- Department overview shows staff, teams, task/workflow/shared-item/CRM associations and recent activity.
- Team overview shows members, placement, lead, CRM/task/workflow/mail/shared-item associations and recent activity.
- Departments and teams can be suspended/reactivated without deleting history.
- Custom roles can be suspended/reactivated.
- Department deletion supports reassignment to another active department when dependencies exist.
- Team deletion supports reassignment to another active team when dependencies exist.
- Custom role deletion supports reassignment to another active role when staff/workflow dependencies exist.
- Destructive flows require explicit DELETE confirmation.
- Built-in/system roles remain protected from deletion.

## Database
No new P27.10 migration.
Migration 039 from P27.8 is still required if it has not already been applied.
