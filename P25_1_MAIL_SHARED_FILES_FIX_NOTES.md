# P25.1 Mail + Shared Files follow-up

This follow-up fixes the Shared Files runtime schema mismatch and improves the P25 mail/file workflows before P26.

## Shared Files

- Repairs existing `shared_files` installations that pre-date migration 032 by adding/backfilling `created_by_id` and other compatibility columns.
- Changes file creator join to a LEFT JOIN so legacy rows remain visible during migration cleanup.
- Expands access target discovery to include active/invited/suspended staff and all existing departments, teams and roles, with inactive state surfaced in the UI.
- Rebuilds Manage Access into a searchable, filterable access console with Staff / Department / Team / Role tabs.
- Every selected target can be given either `Can view` or `Can manage` access.
- Keeps folder-wide Everyone access and file-level inheritance controls.

## PlanoraHub Mail

- Compose no longer opens in a modal. It opens in the main mail reader pane.
- Adds Drafts to the mail navigation. Drafts are private to the staff member who created them.
- Admin gets a Templates workspace.
- Existing PlanoraHub Standard HTML template is stored as the default database template and can be previewed.
- Admin can create/edit HTML templates and choose a default template.
- Templates must include `{{body}}`; `{{sender}}` is optional.
- New conversations store the selected template and replies continue using that thread template.
- Sending a saved draft removes the draft after successful delivery.

## Migration

Run `036_mail_drafts_templates_shared_files_fix.sql` after migration 035.
