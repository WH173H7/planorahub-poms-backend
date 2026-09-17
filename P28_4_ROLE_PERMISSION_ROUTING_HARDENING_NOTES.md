# P28.4 — Role & Permission Routing Hardening

- Hybrid custom roles can now use both company-wide and personal workspaces without AppShell bouncing them between `/home` and an Admin route.
- Dual-mode pages choose their data source from the permission that actually authorizes that page (`tasks.read.all` for Tasks, `activities.read.all` for Follow-ups/Calendar) instead of a generic 'admin' label.
- Admin navigation is now permission-filtered. Partial custom roles no longer see every Admin menu item and then hit 403 responses.
- `/staff` is only surfaced when the role has the permissions the current Staff workspace actually needs.
- Mail and Messenger admin-only controls now use their real permissions / Super Admin identity instead of generic company-wide access.
- Finance is visible as a protected built-in role in Roles & Access, and all system roles are review-only in the custom-role editor.
- New custom roles continue to route by effective permissions; individual ALLOW/DENY overrides remain authoritative because `/auth/me` returns effective permissions after overrides.

No SQL migration is required.

Additional hardening:
- Explicit per-user company-wide permission overrides now remain usable even on built-in operational roles. Built-in roles still land on My Day after login, but authorized Company Access links appear in the staff sidebar.
- Dashboard now checks `analytics.read.all` specifically instead of trusting a generic Admin classification.
- Floating Messenger / full Messenger channel controls use `chat.manage`; non-Super-Admin chat managers cannot create Super-Admin-only rooms.
