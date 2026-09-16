# P27.3 Live production fixes

This patch addresses three production issues discovered after P27/P27.2:

1. **Analytics no longer fails as one monolithic request.** Each analytics section is queried independently. A schema/data problem in one optional section is logged by the backend and that section falls back safely instead of returning an HTTP 500 for the entire Analytics page. Enum comparisons were also hardened with text casts.
2. **Production Supabase admin credentials are normalized.** `SUPABASE_URL` and the server secret are trimmed and surrounding quotes are removed. `SUPABASE_SECRET_KEY` is accepted as a fallback to `SUPABASE_SERVICE_ROLE_KEY`. Staff-auth errors now clearly identify a rejected Supabase admin credential instead of surfacing the ambiguous `Invalid API key` message.
3. **Staff permission selection was rebuilt using native details/checkbox semantics.** The permission browser now renders consistently in production with visible module headings, counts, descriptions, permission codes, search, selected-only mode and bulk select/clear actions.

No database migration is required for P27.3.

Production environment check for staff creation:
- `SUPABASE_URL` must be the URL of the same Supabase project as the server secret.
- Set either `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` on the backend service only.
- Do not put surrounding quote characters in Render environment values.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` belongs on the frontend and is not a substitute for the backend service secret.
