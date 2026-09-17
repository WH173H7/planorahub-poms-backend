# P24 — Leads, Lead Pool & Lifecycle Polish

## Purpose

P24 restructures the CRM around a clearer commercial lifecycle:

**Lead → Pursuit → Prospect Review → Prospect → Client → Realized Revenue**

Raw Leads are operational pursuit records. Financial value is deliberately removed from Lead intake and day-to-day Lead work.

## Lead directory polish

- Lead list rows and mobile cards are clickable across the entire record surface.
- Financial columns were removed from the Lead directory.
- Directory columns now focus on Organization, Stage, Routing, Source, Progress, Priority and Updated date.
- Summary cards now cover Total Leads, Unassigned, Lead Pool, Active Pursuit and Ready for Review.
- Unassigned excludes records already published to the Lead Pool.
- Lead routing labels distinguish Admin assignment, Team assignment, Lead Pool availability and self-selection from the Lead Pool.
- Bulk selection supports direct assignment or publishing eligible New/unassigned Leads to the Lead Pool.

## Lead Pool

Two dedicated workspaces were added:

- Admin: `/lead-pool`
- Staff: `/my-work/lead-pool`

Admin explicitly chooses which New, unassigned Leads enter the shared pool. Existing unassigned Leads are **not** auto-published by migration.

Eligible staff can claim a Lead from the pool. Claiming is enforced atomically by the backend so only the first staff member succeeds. A successful claim:

- assigns the Lead to that staff member;
- removes it from the shared pool;
- records `claimed_by_id` / `claimed_at`;
- records assignment history as `Self-selected from Lead Pool`;
- moves `NEW → ASSIGNED`;
- creates the default pursuit workflow if one does not already exist;
- sends Admin an in-app + email notification;
- sends the staff member an in-app + email confirmation.

Bulk direct assignment is restricted to New, unassigned Leads so already-routed work cannot accidentally be overwritten.

## Lead detail workspace

The Admin Lead workspace was polished around operating context instead of finance:

- Stage
- Routing
- Priority
- Pursuit progress
- Next follow-up
- Current assignment
- organization/contact context
- assignment history
- contacts
- pursuit
- activity timeline

The Routing & Ownership section clearly identifies:

- Admin assigned
- Team assigned
- Available in Lead Pool
- Self-selected from Lead Pool
- Unassigned

Admin can publish/remove an eligible Lead from the pool, assign/reassign an individual, or route to a Team.

## Lead workflows

The Lead Workflows page now communicates the operating path:

**Assigned → Pursuit → Prospect Review**

Expected Revenue is not a normal Lead field. It is requested only at the final Prospect Review gate after pursuit progress reaches 100%.

Backend validation requires:

- pursuit progress = 100%;
- Expected Revenue > 0;

before a Lead can enter `READY_FOR_PROSPECT_REVIEW`.

## Prospect Review and conversion

When staff submits a completed Lead for Prospect Review:

- Expected Revenue is captured for the first time;
- Admin receives in-app + email notification;
- involved staff / Team members receive in-app + email confirmation.

Admin can Return for Work or Approve Prospect.

Approval converts:

`record_type: LEAD → PROSPECT`

and preserves Expected Revenue with the relationship.

## Client lifecycle and revenue

Prospect pages display Expected Revenue.

Admin can convert a Prospect into a Client. Realized Revenue remains empty until actual value/payment is confirmed.

On the Client side Admin can record Realized Revenue. When recorded:

- the amount is stored as `actual_revenue`;
- revenue recording metadata is stored;
- Audit Log records the event;
- active users receive an in-app + email recognition notification naming the responsible staff/Team and the realized amount.

## Analytics alignment

Lead-stage analytics are operational only.

Commercial analytics now use:

- Prospects → Expected Revenue
- Clients → Realized Revenue

Raw Leads are no longer counted as financial pipeline value.

## Notifications / Resend

P24 uses the existing `StaffMailService.sendOperational` path. If the backend has `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configured, lifecycle notifications are sent by email in addition to the in-app notification record.

## Database migration

Run:

`planorabackend/database/migrations/034_lead_pool_lifecycle_revenue.sql`

The migration adds Lead Pool publication metadata, Expected Revenue and Client revenue recording metadata. It intentionally does not publish existing unassigned Leads to the pool.

For existing Prospect/Client records, Expected Revenue is backfilled from legacy Proposed Revenue when available. Raw Lead legacy finance values are cleared because financial value now starts at Prospect Review.

## Validation performed

- 233 TypeScript / TSX source files parsed with TypeScript parser: **0 syntax diagnostics**.
- Local import validation: only Next.js-generated `.next/dev/types/*` references in `next-env.d.ts` are absent from the transfer bundle; all source-controlled local imports resolve.
- `globals.css`: 2601 opening braces / 2601 closing braces.
- Migration 034: balanced `BEGIN` / `COMMIT` and three complete guarded `DO $$ ... $$;` blocks.

A dependency-backed `pnpm typecheck:*` and `pnpm build:*` should still be run in the user's local project before deployment.
