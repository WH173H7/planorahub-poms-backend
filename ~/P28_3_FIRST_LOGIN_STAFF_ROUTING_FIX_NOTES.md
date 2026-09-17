# P28.3 — First-login staff routing hardening

- Built-in operational staff roles (Marketing, Finance, General Staff, Sales Executive, Customer Success) now always land on `/home` after authentication/password setup.
- `/dashboard` now authorizes the current user before calling the protected Admin dashboard endpoint, preventing a 403 flash/stuck error when a staff user reaches a stale dashboard URL.
- `auth/me` reads are forced fresh (`no-store`/`no-cache`) after first-login activation.
- Page-header fallback navigation now resolves the correct home route for the signed-in user instead of hardcoding `/dashboard`.
- Super Admin and custom/manager roles with true administrative permissions keep their existing routing behavior.
- No SQL migration is required.
