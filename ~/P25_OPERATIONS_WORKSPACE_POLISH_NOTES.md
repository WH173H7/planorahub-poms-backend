# P25 — Operations Workspace Polish

## Scope

P25 completes the operations workspace pass before the Task re-architecture (P26) and Analytics / Reports / Settings pass (P27).

### Latest Activities

- Added **Latest Activities** immediately after Staff in the Admin sidebar.
- New `/activities` workspace presents a professional operational timeline for Lead, Prospect, Task and Client events.
- Includes Today / Lead / Prospect / Task / Client quick filters, staff filter, search and date range.
- Activity rows open the related CRM record when a direct route is available.
- Backend endpoint: `GET /api/admin/latest-activities` protected by `activities.read.all`.

### Follow-ups

- Rebuilt the Follow-ups page into one operational schedule workspace rather than multiple large empty cards.
- Summary cards: Overdue, Due today, Upcoming, Completed.
- Status tabs include Cancelled history.
- Search and Admin owner filtering.
- Rich follow-up rows retain Lead, contact, owner, type and schedule context.
- Actions: Open Lead, Complete, Reschedule, Cancel.
- Rescheduling now uses a proper date/time modal instead of a browser prompt.
- Responsive mobile action/card behavior included.

### PlanoraHub Mail — Resend

- Replaced the Google/Gmail product UI with a PlanoraHub CRM Mail workspace powered by Resend.
- Removed `GmailModule` from the running NestJS module tree. Legacy source remains for now but is no longer used by the Mail screen.
- New three-pane mail UX: mailbox navigation, thread list, conversation reader.
- PlanoraHub branded HTML is hard-coded server-side; staff provide sender display name, recipients, subject, message and attachments.
- Up to 5 outbound/reply attachments, 10 MB each.
- Staff visibility rules are enforced server-side:
  - the staff member who created the thread;
  - explicit Admin grant;
  - current CRM Lead/Prospect/Client owner;
  - members of the CRM record's assigned Team;
  - members of the Team captured on the mail thread.
- Super Admin can see all CRM mail and manually grant additional staff access.
- Lead/Prospect/Client reassignment dynamically gives the new owner access without moving or duplicating the thread.
- Replies use `In-Reply-To` / `References` when a provider Message-ID is available.
- Resend inbound `email.received` webhook support creates inbound messages in the CRM thread.
- Received attachments are copied into PlanoraHub's private Supabase attachment bucket so users can open them through normal CRM access controls.
- Incoming replies create in-app notifications for relevant thread participants / Admin.
- Users without `mail.send` can read accessible mail but do not receive Compose / Reply controls.

New backend module: `src/crm-mail/`.

Recommended backend environment:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `RESEND_REPLY_TO_EMAIL` (optional; defaults to `RESEND_FROM_EMAIL`)
- `RESEND_WEBHOOK_TOKEN` (required for the inbound webhook)

Webhook route:

`POST /api/mail/webhooks/resend?token=<RESEND_WEBHOOK_TOKEN>`

Select the Resend `email.received` and `email.sent` events.

### Shared Files

- Redesigned Shared Files as a desktop-style file explorer.
- Folder tree, folder/file visual icons, breadcrumbs and Grid / List view.
- Folder and file access can be granted simultaneously to Staff, Departments, Teams and Roles.
- Access can carry **Can manage access** capability.
- File access can inherit its folder or use custom file-level access.
- Existing publication approval remains: non-admin wider sharing moves to Pending approval before becoming visible.
- Folder creators / managers can manage files inside folders they manage.
- Responsive explorer layout included for tablet/mobile.

### Database migration 035

Adds:

- `crm_mail_threads`
- `crm_mail_messages`
- `crm_mail_attachments`
- `crm_mail_thread_access`
- `shared_item_access`
- `shared_files.inherit_folder_access`

Permissions added:

- `activities.read.all`
- `mail.send`
- `mail.manage`
- `shared_files.manage_access`

Super Admin receives all four explicitly. Marketing receives `mail.send`, Shared Files read/create and Shared Files access management as built-in operational defaults.

## Validation performed

- TypeScript parser sweep across the full source tree: no syntax diagnostics.
- Local frontend alias import resolution: no missing local imports.
- Global stylesheet brace balance verified.
- Migration transaction / dollar-block structure verified.

A dependency-backed Next.js / NestJS typecheck and production build must still be run in the user's local workspace before pushing.

## Next passes

- **P26:** Task system re-architecture — role-aware workflows, Team/Department workflows, scheduling, pause/resume/cancel/complete/reopen and improved creation flow.
- **P27:** split Analytics and Reports, expand operational analytics/reporting, and rebuild Settings.
- After P27: start the end-to-end staff flow from the Admin side as requested.
