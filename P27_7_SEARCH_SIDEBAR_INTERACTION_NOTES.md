# P27.7 — Search polish + sidebar interaction fix

## Global search
- Rebuilt the search result rows into a cleaner icon + type badge + title + subtitle layout.
- Prevents long record kinds such as ORGANIZATION from colliding with result titles.
- Added result count, improved hover/focus treatment, polished desktop input/popover, loading state and empty state.
- Mobile search receives matching visual polish.

## Desktop sidebar auto-collapse
- Page interaction collapse now runs on the bubbling click event instead of pointer-down capture.
- A clicked action executes first, then the expanded desktop sidebar collapses.
- This preserves the existing behavior where clicking normal page space collapses the sidebar without swallowing button/link actions.

No backend or SQL changes are included in this patch.
