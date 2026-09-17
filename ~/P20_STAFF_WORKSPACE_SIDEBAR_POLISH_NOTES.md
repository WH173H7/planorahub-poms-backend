# P20 — Staff Workspace + Sidebar Identity Polish

## Staff workspace

- Reframed the Staff area as **Staff & Access** rather than a flat directory.
- Added a workforce control-center hero with direct Role, Department and Team actions.
- Added a guided setup flow: **Roles & Access → Departments → Teams → Staff**.
- Replaced the old button row with a cleaner workspace tab system.
- Reworked the staff directory with:
  - clearer workforce heading and total count;
  - search + status filters (All / Active / Invited / Suspended);
  - richer staff identity cells with initials;
  - clearer role/job-title hierarchy;
  - compact team chips;
  - upgraded desktop table and mobile cards;
  - one-time credential success banner after staff creation.
- Refined Department and Team cards for clearer counts, member previews and actions.

## Roles & permissions

- Added role overview metrics for active roles, custom roles, assigned staff and available permissions.
- Refined built-in Marketing vs custom role presentation.
- Reworked the permission browser:
  - permission search;
  - grouped modules;
  - select/clear whole module actions;
  - explicit fallbacks when a permission name/description is missing;
  - stronger text/color rules to prevent the blank-looking permission rows seen in the prior UI;
  - selected/shown counts and empty search state.
- Kept per-staff permission review inside the Create Staff wizard.

## Sidebar

- Collapsed desktop sidebar keeps the compact **P** mark.
- Expanded desktop/mobile sidebar now displays the actual PlanoraHub logo in a deliberately small, contained treatment.
- Clicking any navigation item while the desktop sidebar is collapsed automatically expands it and persists the expanded state while continuing navigation.
- Manual collapse/expand control remains available.

## Responsive behavior

- Staff setup flow collapses from 4 columns → 2 columns → single column.
- Staff directory switches from table to cards on smaller screens.
- Status filters and quick actions reflow for tablet/mobile.
- Role metrics, permission browser and organization cards are responsive.

## Validation

- TypeScript parser validation run across frontend/backend source: 0 parse diagnostics.
- `globals.css` brace balance verified.
- Full dependency-backed Next/Nest builds should still be run in the local project before deployment.
