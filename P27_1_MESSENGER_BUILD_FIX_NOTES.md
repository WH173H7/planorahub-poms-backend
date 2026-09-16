# P27.1 — Messenger consolidation + Vercel build fix

## Why this patch exists

P27 introduced a standalone `/internal-chat` Messenger page while the CRM already had a floating in-app chat. The standalone page could briefly render with the wrong access area while the current user was still loading, which could trigger an authorization redirect for administrative users. This patch removes Messenger from the application sidebar and makes the floating Messages control the primary Messenger experience.

It also resolves the three TypeScript errors reported by the Vercel production build.

## Messenger changes

- Messenger removed from Admin and Staff sidebar navigation.
- The floating Messages button now combines:
  - direct staff messages;
  - Team rooms;
  - Department rooms;
  - Company-wide chat;
  - Admin/custom channels already supported by the P27 backend.
- Professional two-pane Messenger panel on desktop and full-screen mobile experience.
- Conversation search and All / Direct / Teams / Departments / Company filters.
- Unread totals on the floating launcher and per conversation.
- Attachments, emoji, group replies, group-message removal, timestamps and direct-message Sent/Delivered/Read status.
- Admin can still create custom company channels from the in-app Messenger.
- Settings opens the floating Messenger instead of navigating to another page.
- The legacy `/internal-chat` URL now redirects authenticated users to their correct main workspace rather than mounting a second Messenger shell.
- Dashboard chat activity now links to Latest Activities rather than the removed standalone Messenger page.
- Sidebar no longer performs duplicate Messenger unread polling; the floating Messenger owns Messenger unread state.

## Vercel build fixes

1. `lead-operations-dialogs.tsx`
   - explicitly narrows `expectedRevenue` before numeric comparison.
2. `task-detail-view.tsx`
   - converts the nullable staff mode into the optional boolean expected by task attachment upload.
3. `reports-view.tsx`
   - imports `ReactNode` for `ReportPanel` children typing.

## Database

No new migration is required. P27 migration 038 remains the database requirement for Team, Department, Company and custom Messenger channels.
