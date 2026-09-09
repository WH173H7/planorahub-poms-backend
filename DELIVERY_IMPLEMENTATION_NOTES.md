# PlanoraHub Delivery Bundle — P9 to P15

This bundle consolidates the current working rebuild plus the delivery-focused implementation requested for the next release.

## Included
- P9 Organization 360 (current implementation + validation fixes)
- P10 Contacts directory and contact-method management
- P11 General task workflow for any department: Assign → Accept → Start → Submit for Review → Admin Approve / Request Revision
- Staff attachment uploads for assigned tasks
- Live overdue-task visibility in Team Activity
- P12 Staff portal: My Day, My Leads, My Tasks, Follow-ups, Calendar
- P13 Lead → Prospect review and Prospect → Client conversion using the same Organization record
- P14 Calendar across task deadlines and follow-ups
- P15 live Dashboard + Analytics
- Staff management page using existing RBAC/staff-account backend
- Read-only Audit Logs page separate from Team Activity
- Navigation cleanup: functional modules are shown; unfinished communication extras are not exposed

## Database
Run `planorabackend/database/migrations/026_delivery_completion.sql` once before testing Prospect → Client conversion. It only adds `leads.converted_to_client_at` and an index.

## Important semantics
- General Task completion never changes a Lead stage.
- Lead pursuit remains the structured sales workflow.
- A Lead, Prospect and Client all retain the same `organization_id`.
- `leads.record_type` is authoritative for LEAD / PROSPECT / CLIENT.
- Staff cannot edit the admin-authored task brief/assignee/deadline through the staff task update route.
- Overdue means deadline has passed and task is not COMPLETED/CANCELLED.

## Validation
Run from repo root:

pnpm typecheck:backend
pnpm build:backend
pnpm --filter planorafrontend lint
pnpm typecheck:frontend
pnpm build:frontend
git diff --check

## Browser QA
1. Dashboard: live KPI values, pipeline, staff delivery, follow-ups.
2. Team Activity: overdue staff-delivery card + activity review feed.
3. Contacts: create/edit/delete Contact; add method; change verification; delete method.
4. Tasks: create a general task for a non-sales staff member with no CRM relation. Staff accepts, starts, uploads file, submits. Admin requests revision, staff resubmits, Admin approves.
5. Staff: create test staff account and log in with that identity to verify staff routing.
6. Lead conversion: move a Lead to READY_FOR_PROSPECT_REVIEW, approve it, verify it appears in Prospects and retains Organization 360. Convert to Client and verify Clients.
7. Calendar: task deadlines and follow-ups appear; staff only sees own scheduled work.
8. Audit Logs: security/admin events display separately from Team Activity.
