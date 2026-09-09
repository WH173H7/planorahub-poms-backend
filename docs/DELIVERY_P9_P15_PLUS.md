# PlanoraHub POMS — Delivery Bundle: P9–P15 Plus Communications

This bundle extends the current P9–P15 delivery build with a professional UI polish and the operational tools requested for the delivery window.

## Included

- Organization 360, Contacts, Lead/Prospect/Client lifecycle, Calendar, Follow-ups, Dashboard/Analytics, Staff portal and Team Activity from the previous delivery bundle.
- Company-wide Tasks with Accept → Start → Submit → Admin Approve / Request Revision.
- Overdue task delivery visibility in Team Activity.
- Task Workflow library: reusable process guides with ordered steps and per-task completion tracking.
- Multiple file attachments during task creation (uploaded after task record creation using the existing secure attachment endpoint).
- Google Workspace/Gmail integration: connect individual staff mailboxes, read/search messages and send mail inside POMS.
- Internal team chat with company-wide and admin-only channels.
- Communication Templates: Admin-managed approved scripts, staff-readable/copyable and selectable in Gmail compose.
- Reports: date-filtered pipeline, task and staff delivery reporting with CSV export.
- Official Letters: configurable PlanoraHub letterhead settings, letter drafts and server-generated PDF download.
- Navigation and visual polish across forms, native selects, dialogs, cards, task workspaces and the new communication modules.

## Database

Apply `planorabackend/database/migrations/027_workspace_communications_and_task_workflows.sql` after migration 026.

## Google Workspace / Gmail environment variables

Configure these in `planorabackend/.env` (do not commit actual values):

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=
FRONTEND_URL=http://localhost:3000
```

`GOOGLE_TOKEN_ENCRYPTION_KEY` should be a long random secret. OAuth refresh tokens are encrypted with AES-256-GCM before storage.

For production, change the redirect URI and FRONTEND_URL to the deployed HTTPS URLs and register the same callback URI in Google Cloud Console.

## Scope note

Gmail requires real Google OAuth credentials and network access to Google APIs, so connection/read/send can only be fully end-to-end tested after those credentials are configured. The remaining modules are local application/database features.
