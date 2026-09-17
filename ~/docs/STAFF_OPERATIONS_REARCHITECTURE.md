# PlanoraHub Staff Operations Re-architecture

## Operating hierarchy

**Department → Staff → optional cross-department Teams → Team Lead → Lead ownership.**

A Department is required before creating ordinary Staff. Teams may contain Staff from different Departments, and an active Team can own Leads independently of a single staff owner. The Staff workspace now makes this hierarchy explicit and keeps Department/Team management inside Staff rather than in separate primary navigation items.

## Lead operating model

A Lead is an Organization + Contacts + commercial opportunity. Every Lead carries:

- Proposed Revenue — default **NGN 1,000,000**
- Revenue Probability — default **30%**
- Weighted Revenue — Proposed Revenue × Probability
- optional Actual Revenue
- optional Staff owner or Team owner
- claim metadata when a Staff member picks it from the Lead Pool

Permitted Staff can claim unassigned Leads from the Available Lead Pool. A Lead cannot be claimed after another Staff member or Team has taken ownership.

### Import template

The Admin Lead Import workspace downloads `planorahub-lead-import-template.csv` with these headers:

`organization_name, industry, website, general_email, phone, location, source, priority, proposed_revenue, revenue_probability, notes`

`organization_name` is required. If `proposed_revenue` is blank, frontend and backend both normalize it to **1000000**. If `revenue_probability` is blank, it becomes **30**. The preview screen displays the normalized revenue and probability before commit.

## Navigation

Admin navigation is organized as Dashboard → Staff → Leads/Prospects/Clients → Tasks/Follow-ups/Calendar → Communication → Analytics & Reports → Audit Logs → Settings.

Departments and Teams live inside Staff. Lead Workflows are contextual to Leads. Task Workflows are contextual to Tasks. Shared Files replaces the old Templates-style workspace in primary communication navigation. Reports are accessed through Analytics & Reports.

Staff navigation remains action oriented: My Day, Leads, Tasks, Follow-ups and Calendar, followed by Email, Official Letters and Shared Files.

## Official letters

Default workflow:

**Staff draft → Submit for approval → Super Admin Approve / Request changes → approved PDF download.**

`letters.write` is separate from `letterhead.manage`; ordinary Staff can write official correspondence without receiving permission to change the company stationery configuration. Super Admin can exempt trusted Staff or Teams from final approval. Editing a pending or approved document returns it to Draft and increments its version, invalidating the previous approval. Staff can only edit/download their own letters; Super Admin can manage all letters.

## Shared Files

Folders can be scoped to:

- Private
- Everyone
- selected Staff
- Department
- Team
- Lead participants
- Task participants

The folder modal uses real selectable Staff/Department/Team/Lead/Task records rather than raw UUID entry. Staff-created folders intended for a wider audience enter **Pending approval**; Super Admin can Approve or Reject. Approval controls are permission-aware and are not rendered for ordinary Staff.

## Analytics and Search

Revenue, Leads, Staff and Task delivery are first-class management analytics. The Staff Operations analytics route uses the existing `analytics.read.all` permission. Global CRM Search includes Leads directly assigned to a Staff member and Leads owned by a Team that Staff belongs to.

## Calendar

PlanoraHub remains the operational calendar. A connected Google Workspace account can create PlanoraHub reminders in the Staff member's Google Calendar for Google's normal phone/desktop notifications. Existing Google connections may need to reconnect after the Calendar OAuth scope is introduced.

## Database migration 032

`032_staff_operations_rearchitecture.sql` is designed to be rerunnable on an existing PlanoraHub database. In particular it:

- drops `teams_department_id_name_key` as a **constraint** before attempting to remove any backing standalone index;
- explicitly adds `shared_folders.parent_id` and other new columns even when `shared_folders` already existed;
- guards new foreign keys/check constraints through `pg_constraint` checks;
- backfills revenue defaults before applying `NOT NULL`;
- seeds `leads.claim`, Shared Files permissions, `letters.write`, `letters.approve`, and the two previously referenced-but-unseeded Admin task-attachment permissions;
- does not grant ordinary Staff the broader `letterhead.manage`, `shared_files.approve`, or `letters.approve` permissions.

## Validation performed on this delivery

The source bundle was parsed with the TypeScript compiler parser across 217 `.ts`/`.tsx` source files with no syntax diagnostics. Regression checks confirmed that no `helperText=` prop remains in the frontend and that migration 032 has balanced transaction/dollar/parenthesis structure and the two SQL failure cases are addressed.

A dependency-backed Next.js/NestJS build must still be run in the local project because the transfer bundle intentionally excludes `node_modules`.
