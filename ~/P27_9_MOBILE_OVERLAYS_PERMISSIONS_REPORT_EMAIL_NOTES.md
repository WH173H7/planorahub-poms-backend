# P27.9 — Mobile overlays, permission browser root fix & report email handoff

## Fixed
- Staff permission catalogue no longer collapses into thin bars in Safari.
  - Root cause: the permission module container was a max-height CSS Grid. Its overflow-clipped grid children were allowed to shrink, so all module tracks compressed to fit the fixed height.
  - Replaced with a non-shrinking flex stack and controlled React module expansion.
  - Shared by staff creation and existing-staff access editing.
- Mobile CRM search is rendered through a portal to `document.body` so it is no longer trapped by the glass topbar/backdrop-filter containing block.
- Mobile notification panel is rendered through a portal and opens below the app topbar instead of upward.
- Report CSV export now offers an optional "Send to my email" handoff after download.
  - Backend regenerates the same filtered report and sends it as a CSV attachment to the authenticated admin email using the existing Resend configuration.
- Global search network failures are handled quietly rather than producing an unhandled promise rejection.

## Database
No new P27.9 migration.
P27.8 migration 039 is still required if it has not already been applied.
