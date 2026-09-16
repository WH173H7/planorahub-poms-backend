# P27.11 — Audit Trail Hardening

This is a cumulative patch on top of P27.10.

## Database order

1. Migration `039_direct_chat_access_task_email_reminders.sql` must exist in the database first. If it already ran successfully, do not rerun it just for P27.11.
2. Run `040_audit_log_actor_snapshots.sql` before deploying the P27.11 backend.

Migration 040 preserves the identity, role and department of the actor on every future audit event so historical records remain attributable even after a staff account is deleted. It also backfills current rows where the actor still exists.

## Audit coverage added/hardened

- CRM session opened and explicit logout.
- Password changes.
- Staff creation, profile/access changes, direct-message access, status changes, password reset and deletion/reassignment.
- Role, department and team creation/update/status/deletion, including role permissions and team membership changes.
- Direct and channel chat sends, edits, deletes, attachment sends and attachment opens.
- Shared-folder creation/approval/opening, file upload/download and access-policy changes.
- CRM mail draft/template creation/update/delete, attachment opening, send/reply/access activity and inbound mail receipt.
- Report generation, local CSV download and report email delivery.
- Task attachment downloads and assignment attachment downloads.
- Task due-reminder delivery success/failure.
- Official-letter lifecycle plus generated PDF download and approval-bypass changes.

Existing audit coverage for Leads, Contacts, Tasks, pursuit workflows, organizations, activities and other CRM operations is retained.

## Audit metadata

Audit events store the actor, action, module, entity, timestamp, before/after/context JSON where appropriate, request IP address and browser/user-agent when the action originates from a request. Actor identity snapshots preserve historical attribution after account deletion.

Read/open events that can be triggered repeatedly by React rendering are deliberately de-duplicated for a short window (for example a shared-folder open) so the audit trail remains useful instead of recording UI refresh noise.

## Audit Logs UI

The Audit Logs screen is paginated instead of silently stopping at the first 500 events. It can load older records and shows actor snapshots, role/department, IP/device data and expandable before/after context.

## Validation performed in patch workspace

- TypeScript/TSX parse/transpile scan: 392 files, 0 parse errors.
- `globals.css`: 4190 opening braces and 4190 closing braces.
- Full dependency-backed frontend/backend builds were not executed in the patch environment. Run the repository's normal `pnpm` typecheck/build commands locally before deployment.
