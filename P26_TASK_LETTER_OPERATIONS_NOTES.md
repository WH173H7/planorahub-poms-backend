# P26 — Task Operations + Official Letter Approval Polish

## Scope

P26 rebuilds Tasks and Task Workflows into an operational routing system and adds a professional Official Letter approval-policy layer.

## Task operations

### Assignment model

Tasks can now be routed to:

- Staff
- Team
- Department
- Unassigned

Team and Department tasks are shared assignments. The first eligible staff member who accepts the task becomes the accountable worker; other eligible members can still see the shared work context but cannot take over the controlled work sequence.

### Role-aware workflows

Task Workflows now have a scope:

- General
- Role
- Team
- Department

When Admin chooses a Staff member, PlanoraHub shows General workflows plus workflows matching that Staff member's Role. Team and Department tasks only surface the corresponding Team/Department workflows plus General workflows.

Workflow editing moved out of the old cramped modal and into dedicated pages. Workflows support:

- description/category
- active/archived state
- scoped default
- ordered steps
- guidance
- evidence expectation

### Inline Team / Department workflow creation

While creating a Team or Department task, Admin can create a custom scoped workflow directly inside the task creation screen. The workflow is saved to the reusable workflow library and immediately selected for the new task.

### Scheduled delivery

Admin can choose Send now or Schedule. Scheduled tasks remain hidden from staff until dispatch time. A backend dispatch service checks due scheduled tasks every minute, releases them atomically, records task/audit history and sends in-app notifications to the target Staff/Team/Department.

Important: exact clock-time delivery requires the backend process to be awake. A sleeping free-host instance may dispatch after it wakes.

### Task lifecycle controls

Admin can:

- Dispatch now
- Pause
- Resume
- Cancel
- Mark completed
- Reopen
- Approve submitted work
- Request revision with a review note

Staff work sequence remains controlled:

- Accept
- Start
- complete workflow steps
- Submit for review

Task lifecycle changes and scheduled dispatches are written to task history and audit logs. Staff receive task assignment/control/review notifications; Admin receives a notification when work is submitted for review.

### Task UI/UX

Tasks now use a professional operations workspace with:

- All / Active / Scheduled / Paused / Overdue / Completed metrics
- search and status filtering
- full clickable rows and responsive mobile task cards
- routing and workflow visibility
- dedicated Create Task page
- dedicated Task Workflow library/editor
- improved task detail hero, process checklist, CRM context, attachments and timeline
- Admin lifecycle control center

## Official Letters

### Letterhead corrections

The official letter now consistently uses:

- `admin@planorahub.app`
- `www.planorahub.app`

The footer no longer repeats the RC number or website. It now reads only:

`PlanoraHub official correspondence`

These changes apply to both the browser A4 preview and generated PDF.

### Approval policy

Approval is required by default.

Admin can create no-approval-required rules for:

- Staff
- Roles
- Departments
- Teams
- specific Lead / Prospect contexts

A Lead rule only applies when the official letter is explicitly linked to that Lead/Prospect.

Staff covered by a matching bypass rule still finalize the document through the normal submit action; PlanoraHub records it as approved without requiring a separate Admin review. PDF download is permitted only after the letter reaches APPROVED state.

### Admin approval inbox

Letters requiring review are sent to:

`/letterhead/approvals`

Super Admin receives an in-app notification linking directly to that inbox.

The approval inbox includes:

- pending count
- author / role / department
- recipient
- linked CRM context
- submitted time
- letter body
- review note / requested changes
- Open full letter
- Request changes
- Approve letter

### Approval rules

Approval policy management is available at:

`/letterhead/approval-rules`

The page clearly distinguishes Approval required from No approval needed and supports Staff, Roles, Departments, Teams and Lead-related contexts.

### Letter editor

The editor now includes a Lead / Prospect context selector on desktop and mobile so Lead-specific approval policy can be evaluated consistently.

Editing an approved or pending document continues to invalidate the prior approval and return the document to Draft.

## Database migration

Run:

`planorabackend/database/migrations/037_task_operations_and_letter_approvals.sql`

Migration 037 adds Task routing/scheduling/control columns, workflow scope columns, `tasks.control`, accepted-worker locking, Lead-linked letter context and expanded Official Letter approval-rule subjects.

## Validation performed on the delivery

- TypeScript parser sweep: 371 `.ts` / `.tsx` files, 0 syntax diagnostics.
- Frontend local-import resolution: 0 missing local imports.
- Backend local-import resolution: 0 missing local imports.
- Frontend static TypeScript run with dependencies intentionally absent produced only expected missing React/Next/Node-type diagnostics for changed files; no additional local semantic diagnostics were surfaced.
- Backend static TypeScript run is blocked only by absent `@types/node` and `vitest/globals` in the transfer bundle.
- `globals.css` braces balanced: 3243 opening / 3243 closing.
- Migration 037 has balanced transaction, DO blocks and parentheses.

A dependency-backed local `pnpm typecheck:*` and `pnpm build:*` must still be run after applying the bundle.
