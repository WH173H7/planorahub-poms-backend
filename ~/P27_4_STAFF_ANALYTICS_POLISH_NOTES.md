# P27.4 — Staff profile, permissions and analytics polish

- Rebuilt the Staff detail page into a 360-style profile with identity, work structure, team memberships, CRM/work connection counts, account security, and a cleaner activity timeline.
- Staff who are still INVITED and have never activated their account (password has not been changed) can be permanently deleted by an authorized admin. Activated accounts remain preserve-history only: suspend/disable instead of delete.
- Added backend connection summaries for assigned Leads/Prospects/Clients, Tasks, Follow-ups, Mail threads, Official Letters and Shared Files.
- Replaced the Safari-fragile `<details>/<summary>` permission UI with a controlled module browser so permission names and descriptions render reliably in the staff creation wizard.
- Added proper visual hierarchy, module counts, selected counts, search, selected-only filtering, per-module select/clear, permission descriptions and codes.
- Added missing analytics bar/list styling for Lead Sources, Industry Mix and Task Priority so labels, counts and bars no longer run together.
- No database migration is required.
