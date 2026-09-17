# P27 — Final Admin Polish

P27 completes the Admin-side product pass before the full Staff journey is tested end-to-end.

## Analytics

`/analytics` is now a dedicated operational intelligence workspace rather than a combined report screen.

It includes:
- executive overview and six-month operating trend;
- Lead, Lead Pool, Prospect and Client lifecycle metrics;
- Lead → Prospect and Prospect → Client conversion rates;
- Prospect expected revenue and Client realized revenue (raw Leads remain non-financial);
- source and industry breakdowns;
- staff, Department and Team delivery views;
- task completion, scheduled/paused/overdue workload and workflow status distribution;
- Follow-up, Mail, Official Letter and Shared File operating signals.

## Reports

`/reports` is now separate from Analytics and acts as the report-generation workspace.

Admin can:
- choose report focus;
- filter by date, staff, Department, organization/CRM record, record type/stage and task status;
- use quick date presets;
- save report views locally;
- inspect lifecycle, commercial, task and communications totals;
- export the generated result as CSV.

## Settings

`/settings` is reorganized as a professional settings center:
- My account;
- Staff & access;
- Communication;
- Official letters;
- Shared files;
- Notifications;
- System.

The former Google Workspace-oriented communication setup has been removed from the active Settings experience. PlanoraHub Mail, Messenger, Broadcasts and mail templates are the communication controls.

## Official Letters — final Admin approval pass

The official stationery now uses:
- `partnership@mail.planorahub.app`
- `www.planorahub.app`

The footer no longer repeats RC/website metadata and remains `PlanoraHub official correspondence`.

Letter approval remains required by default. Admin can create approval-bypass rules for:
- Staff;
- Roles;
- Departments;
- Teams;
- specific Leads / Prospects.

Pending letters are received at `/letterhead/approvals`.

When a staff member submits a letter requiring approval:
- Super Admin receives an in-app notification;
- Super Admin receives a Resend operational email with a link to the Approval Inbox;
- Official Letters shows a live pending count/badge in Admin navigation and on the approval action.

Admin can Approve, Request changes, or Reject. Reject requires a reason.

The staff creator receives an in-app and email notification for approval, requested changes or rejection.
Editing a reviewed/pending letter invalidates that review and returns the document to Draft.

## PlanoraHub Messenger

`/internal-chat` is now a full Messenger workspace.

Conversation types:
- Direct messages;
- Company room;
- Department rooms;
- Team rooms;
- custom company channels;
- Admin-only custom rooms.

Department and Team rooms are synchronized from active company structure. Access is enforced server-side:
- Department chat is limited to members of that Department (plus Super Admin);
- Team chat is limited to Team members (plus Super Admin);
- Company chat is company-wide;
- Admin room is Super Admin only.

Messenger includes:
- conversation search and type filters;
- unread counts in the Messenger list and application sidebar;
- last-message previews;
- member/context display;
- group message replies;
- attachments;
- group message editing/removal support in the API;
- direct-message sent/delivered/read states;
- date separators;
- mobile conversation navigation.

All active staff can now direct-message other active staff; direct messaging is no longer limited to contacting Super Admin.

## Notifications

The Notification Center now has clearer event presentation with contextual icons/kinds and existing click-through behavior. Letter approvals are also surfaced independently through the Official Letters badge.

## Navigation

Admin Insights is now:
- Analytics
- Reports
- Audit Logs

Communication includes Messenger as a first-class workspace.

## Database migration 038

`038_admin_insights_messenger_letter_notifications.sql`:
- adds structured Company / Department / Team / Custom / Admin group-chat types;
- links Department and Team rooms to their structures;
- seeds rooms for current active Departments and Teams;
- adds per-user channel read state;
- adds group-message reply/deletion metadata;
- adds internal chat attachments;
- applies the final letterhead email, website and footer values.

The service continues to create rooms for new active Departments/Teams after the migration.

## Validation performed on the delivery

- 249 `.ts` / `.tsx` source files parsed with the TypeScript parser: **0 syntax diagnostics**.
- Local frontend/backend import sweep: **0 missing local imports**.
- `globals.css`: **3502 opening / 3502 closing braces**.
- Migration 038: one balanced `BEGIN` / `COMMIT`; two balanced guarded `DO $$` blocks.

A dependency-backed `pnpm typecheck` and production build must still be run in the local project before deployment.
