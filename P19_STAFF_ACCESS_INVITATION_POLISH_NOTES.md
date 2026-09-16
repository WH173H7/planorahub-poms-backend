# P19 — Staff Access, Roles & Invitation Polish

## Staff workspace

The Staff page is now the single workforce setup workspace:

**Roles & permissions → Departments → Teams → Staff**

It includes clickable summary cards, responsive tabs, the existing Department/Team management, role management and a four-step staff creation wizard.

## Dynamic roles

- `SUPER_ADMIN` remains protected and is not assignable through the staff creation flow.
- `MARKETING` is the only built-in assignable staff role.
- Legacy seeded staff roles are archived by migration 033 so existing staff records remain valid but the roles are not offered to new staff.
- Super Admin can create custom roles such as Developer, Admin or Desk Staff.
- Role creation/editing includes the permission catalog grouped by module.
- Custom roles can be archived/reactivated without deleting historical staff references.
- Marketing can have its permissions reviewed/updated but cannot be renamed or archived.

## Staff provisioning wizard

1. Profile
2. Role & access
3. Department & Teams
4. Review & invitation

Selecting a role immediately loads its inherited permissions. Admin can review and customize the effective permission selection for the specific staff member. Differences from the role are stored using the existing `user_permission_overrides` ALLOW/DENY model.

## Resend invitation email

Backend-only Resend integration uses the Resend REST Email API. No API secret is exposed to the frontend.

Required Render environment variables:

- `RESEND_API_KEY` — Resend sending API key
- `RESEND_FROM_EMAIL` — bare verified sender address, e.g. `crm@planorahub.app`

Optional:

- `RESEND_FROM_NAME` — defaults to `PlanoraHub CRM`
- `CRM_LOGIN_URL` — defaults to `${FRONTEND_URL}/login` and ultimately `https://crm.planorahub.app/login`

Creation email includes:

- CRM login link
- staff login email
- one-time temporary password
- role
- department
- teams
- first-login password change requirement

If Resend is unavailable or not configured, staff creation still succeeds. The admin sees the delivery status and still receives the one-time temporary password.

## First login protection

A new account stays `INVITED` with `must_change_password=TRUE`.

After successful temporary-password authentication, the user is redirected to `/change-password`. Backend `AuthGuard` blocks all other protected CRM endpoints while the password-change requirement is pending.

After the user updates their Supabase Auth password, `/api/auth/password-changed` clears `must_change_password`, sets `password_changed_at`, promotes `INVITED` to `ACTIVE`, and writes an audit event.

## Admin password reset

The staff 360 page now opens a reset confirmation flow where the administrator chooses whether the temporary password should also be emailed to the staff member.

The generated password is returned once to the administrator regardless of that choice. Reset immediately sets `must_change_password=TRUE`, so an already logged-in staff member is redirected to the password-change screen on their next API request.

## Database migration

Run:

`planorabackend/database/migrations/033_staff_roles_and_invitation_flow.sql`

before deploying the new backend code.

## Validation performed

- 348 TS/TSX files parsed with TypeScript parser
- 0 syntax diagnostics
- 0 missing local frontend imports
- `globals.css` braces balanced: 2133 / 2133
- migration 033 transaction markers balanced

A dependency-backed `pnpm typecheck:*` and `pnpm build:*` should still be run in the local project before push/deploy.
