# PlanoraHub Staff Operations Re-architecture — Delivery Notes

Delivery base: full September 8 PlanoraHub source bundle, preserving the existing CRM functionality and applying the Staff Operations fixes on top.

## Fixed in this delivery

- React `helperText` DOM-prop warning removed from Shared Files.
- Shared Files redesigned with real selectable Staff / Department / Team / Lead / Task audiences.
- Shared Files create/read/approve routes now enforce their matching permission codes.
- Shared Files approval controls are shown only to authorized users and API errors are handled in-page.
- Migration `032_staff_operations_rearchitecture.sql` is rerunnable and fixes both reported SQL failures:
  - drops `teams_department_id_name_key` as a constraint before any old standalone index;
  - explicitly adds `shared_folders.parent_id` before indexing it even when the table already exists.
- Lead revenue fields are backfilled/defaulted; proposed revenue defaults to NGN 1,000,000 and probability to 30%.
- Lead Import CSV download is browser-safe, includes revenue columns, and the preview displays normalized revenue/probability.
- Lead Import backend independently defaults a blank proposed revenue to 1,000,000 and a blank probability to 30.
- Team Lead ownership validates the selected Team is active.
- Available Lead Pool claim is permission-guarded and UI-aware.
- Team membership is cross-department; changing a Staff Department no longer strips Team membership.
- Analytics Staff Operations endpoint now uses the existing `analytics.read.all` permission and handles frontend API failure without a Next runtime overlay.
- Global Search now includes Leads owned through Teams the Staff member belongs to.
- Official Letters use `letters.write` for drafting instead of broad `letterhead.manage`.
- Letter approval controls are permission-aware; unapproved letters cannot be issued.
- Staff can edit/download only their own official letters; Super Admin can access all.
- Editing pending/approved correspondence invalidates approval and returns it to Draft.
- Approved PDF download no longer performs an accidental save that invalidates approval first.
- Previously referenced Admin task-attachment upload/delete permission codes are now seeded for Super Admin.
- Staff page visibly explains Department → Staff → cross-department Team → Lead ownership and shows live structure counts.
- Re-architecture documentation updated.

## Validation completed in the delivery environment

- TypeScript compiler parser: 217 `.ts` / `.tsx` source files parsed with no syntax diagnostics.
- Local source-import resolution: passed (generated Next `.next` declarations intentionally excluded).
- Permission audit: every backend `RequirePermission(...)` code is present in migration/seed SQL.
- `helperText=` regression search: zero occurrences.
- Migration 032 checks: transaction wrapper, constraint-before-index ordering, explicit `parent_id`, guarded revenue constraint, permission seeding, balanced parentheses and dollar-quoted blocks all passed.
- No `.env`, `.env.local`, `.env.production` or `.env.development` files are included in the delivery source.

## Run locally before deployment

The transfer ZIP excludes `node_modules`, so run these in the extracted project on the development Mac:

```bash
pnpm install
pnpm typecheck:backend
pnpm build:backend
pnpm typecheck:frontend
pnpm --filter planorafrontend lint
pnpm build:frontend
git diff --check
```

Then run `planorabackend/database/migrations/032_staff_operations_rearchitecture.sql` against the intended PlanoraHub database before starting the updated application.

## Migration note

If the database currently contains duplicate active Team names that differ only by case, the new company-wide active Team-name unique index will correctly stop the migration. Resolve those duplicate Team names first rather than silently deleting data.
