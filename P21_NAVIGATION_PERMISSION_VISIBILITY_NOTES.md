# P21 — Navigation + Permission Visibility Polish

This patch builds on P20 and addresses three production UI issues reported during local QA.

## Sidebar branding

- The expanded desktop/mobile sidebar uses the real transparent `planorahub.png` asset without the artificial white card/background.
- The logo is intentionally compact so it sits comfortably inside the 72px sidebar brand area.
- The collapsed sidebar still uses the compact `P` mark.
- Existing P20 behavior remains: selecting a navigation icon while collapsed expands the sidebar.

## Universal page back action

- The shared `PageHeader` now renders a Back button on every page that uses the application shell.
- It uses browser history so users return to their previous CRM state/page rather than a hard-coded destination.
- If no usable history exists, the fallback is `/dashboard`.
- The control is responsive and keyboard-focusable.

## Roles / permissions visibility

- Rebuilt the permission browser with unique `access-permission-*` classes to avoid conflicting legacy styles.
- Replaced label/checkbox rows with explicit accessible toggle buttons.
- Every permission now visibly renders:
  - permission name,
  - description/fallback detail,
  - permission code,
  - selected state.
- Permissions remain grouped by module with per-module Select/Clear actions.
- Search, selected count, responsive single-column layout, and read-only behavior remain supported.

## Validation

- TypeScript/TSX parser pass: 348 files, 0 syntax diagnostics.
- `globals.css` brace balance: 2338 opening / 2338 closing.
- No database migration is required for this patch.
