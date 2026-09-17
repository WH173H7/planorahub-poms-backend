# P27.6 — Admin cleanup + shell polish

## Included
- Active, suspended, disabled and invited staff accounts can be permanently deleted by Admin.
- A staff account with linked CRM work requires an active replacement staff member before deletion.
- Lead/task/follow-up/assignment/organization ownership and created workspace records are handed over before the account row is removed.
- Self-deletion is blocked and the final enabled Super Admin remains protected.
- Lead records now have a deliberate permanent delete flow from the Lead workspace. The organization record is retained.
- Staff-profile connection cards now open their matching workspace.
- The top navigation now carries the normal-color PlanoraHub logo.
- The sidebar brand slot is now a Home button that routes to the correct admin/staff home.
- Topbar and purple sidebar receive a restrained glassmorphic treatment.
- Avatar initials are force-centered in both the nav trigger and dropdown.
- Includes the P27.5 mobile backdrop pointer-events fix.

## SQL
No new migration is required for this patch.
