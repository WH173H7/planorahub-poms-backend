# PlanoraHub P29 — Pursuit Workflow 2.0

This package implements the agreed Lead → Pursuit enhancement without creating a separate Opportunity module.

## What changed

### Backend
- Added migration `database/migrations/043_pursuit_workflow_v2.sql`.
- Workflow stages can now define structured form fields, guidance, evidence minimums, comment availability, task requirements, blocking-task requirements and follow-up requirements.
- Pursuit instance stages snapshot the workflow schema so later workflow edits do not rewrite active historical Pursuits.
- Stage responses are stored as structured JSON in `field_values`.
- Backend validates required fields, field types/options, contact ownership, evidence minimums, blocking tasks and follow-up requirements before stage submission.
- Staff cannot directly change Lead stage through the old staff stage endpoint. Pursuit stage submission is the progression gate.
- Existing Lead stage is synchronised to the Pursuit journey for visibility; final qualification maps to `QUALIFIED`. Admin can still use the existing Prospect Review path and expected-revenue gate.
- Added Pursuit-stage ↔ Task relationships so Admin can create and assign tasks directly to a stage and optionally make them block stage completion.
- Added a unified Pursuit timeline combining stage events and linked Task events.
- Added secure evidence download endpoints.
- Staff can comment on stages.
- Existing review/retake/custom-stage functionality is preserved.
- Existing Lead assignment logic now snapshots the full configured stage schema.
- Removed old `.p5-backup` source files.

### Default workflow
The active default workflow is upgraded to:

1. Research
2. Contacted
3. Engaged
4. Meeting / Discovery
5. Demo
6. Proposal
7. Negotiation
8. Qualified / Conversion

Research contains the CEO-requested commercial/event context fields:
- Target Event
- Event Date
- Event Type
- Expected Attendance
- Opportunity Value
- Current Event Technology / Process
- PlanoraHub Modules Required

It also includes contact/research fields. The other stages have stage-specific forms rather than one generic notes field.

### Frontend
- Rebuilt the Admin Pursuit Workflow Builder around configurable stage forms.
- Staff Pursuit workspace now shows the current stage as the execution form, with draft saving, structured responses, comments, evidence and task gates.
- Removed the staff-side manual `Change Stage` action.
- Admin Lead/Pursuit view now displays structured stage responses, linked stage tasks, evidence and the Pursuit timeline, and can create stage-linked tasks.
- Added secure evidence open/download actions.

## Database application
Apply migration `043_pursuit_workflow_v2.sql` to the same Supabase/PostgreSQL database used by PlanoraHub.

The repository does not contain an automatic migration runner, so this SQL must be applied through the existing database migration process used for migrations 001–042.

## Validation performed in this package
- All backend TypeScript source files: 0 TypeScript parser diagnostics.
- All frontend TypeScript/TSX source files: 0 TypeScript parser diagnostics.
- Migration structure: balanced transaction and dollar-quoted blocks.

Dependency-backed `npm build` / `pnpm typecheck` could not be executed in the packaging environment because the uploaded source archives do not contain `node_modules` and package installation was unavailable here. Run the project's normal local checks before deployment.
