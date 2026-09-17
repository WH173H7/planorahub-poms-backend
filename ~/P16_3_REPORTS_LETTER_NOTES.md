# P16.3 Reports + Official Letter consistency fixes

- Fixed Reports backend 500 caused by using the non-existent `leads.owner_id`; reports now use the real `leads.assigned_to_id` ownership field.
- Added resilient filtered reports for date range, staff, department, company/organization, CRM record type, Lead stage, Task status and report focus.
- Added Company/Organization activity table and enhanced staff delivery table.
- Reports frontend now catches backend errors and shows a recoverable in-app error state instead of triggering the Next.js runtime overlay.
- Filtered CSV export includes lifecycle, staff and company sections.
- Official Letters now uses Save & Download so the PDF is generated from the exact latest editor state.
- Reworked PDF stationery to visually match the in-app A4 preview: white page, PlanoraHub wordmark, top-right purple corner, purple rule, balanced margins, subtle diagonal PlanoraHub watermark, fixed branded footer and page numbering.
- Fixed letter date formatting in exported PDFs.
- Preserved signature image, signatory name and signatory position in exported PDFs.
- No database migration is required for P16.3.
