# P27.5 — Mobile interaction layer fix

## Problem
On mobile widths, the navigation backdrop and drawer were changed from `display:none` to `display:block` by responsive CSS even while the mobile menu was closed.

The closed backdrop remained a full-screen fixed element (`inset:0`, `z-index:70`) with `opacity:0`. Because transparent elements still receive pointer events, it intercepted taps across the application. The floating Messenger launcher remained clickable because it sits above that layer (`z-index:75`).

## Fix
The closed mobile backdrop and drawer now use `pointer-events:none`.

When `data-open=true`, pointer events are explicitly restored with `pointer-events:auto`.

This keeps the existing open/close animation and layering while allowing the dashboard, top navigation, hamburger button, KPI cards, analytics links, sidebar and other mobile controls to receive taps normally whenever the drawer is closed.

## Files changed
- `planorafrontend/app/globals.css`

## No migration
No database or backend migration is required.
