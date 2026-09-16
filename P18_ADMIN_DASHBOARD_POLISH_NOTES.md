# P18 — Admin Dashboard Page-by-Page Polish

This pass starts the post-P17 page-by-page polish with the Admin Dashboard.

## Dashboard interaction changes

- All top KPI cards are navigable:
  - Total Leads → Leads
  - Active Pursuit → Leads
  - Prospects → Prospects
  - Clients → Clients
  - Overdue Tasks → Tasks
  - Follow-ups Today → Follow-ups
- Pipeline donut opens Analytics.
- Pipeline legend rows are clickable and open Leads, Prospects or Clients.
- Delivery Health tiles are clickable:
  - Active pursuits → Leads
  - Overdue tasks → Tasks
  - Follow-ups today → Follow-ups
  - Ready for review → Leads
- Upcoming follow-up rows open the relevant Lead workspace when a Lead is attached; otherwise they open Follow-ups.
- Staff delivery now exposes direct navigation:
  - staff name → staff profile
  - assigned lead/task counts → corresponding workspace
  - overdue/completed task counts → Tasks
- Recent Activity rows now route to the most relevant entity/workspace when possible.

## Recent Activity simplification

- Reduced the dashboard feed to the latest 4 entries.
- Made each entry visually lighter and more compact.
- Added a clear `See all` action in the card header.
- Added a `View all system activity` footer action.
- Both routes open Audit Logs.

## Backend/API support

Dashboard payload now includes:

- `entity_type`, `entity_id`, and `module` for recent audit activity.
- `lead_id` and `organization_id` for upcoming follow-ups.

No database migration is required.

## Validation

- Parsed the entire frontend/backend source tree with TypeScript parser: 220 TS/TSX files, 0 syntax diagnostics.
- globals.css braces balanced: 2023 opening / 2023 closing.

A dependency-backed `pnpm typecheck` / production build should still be run in the user's local working project after applying the package.
