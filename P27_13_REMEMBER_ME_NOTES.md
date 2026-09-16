# P27.13 — Remember Me

- Adds an explicit **Remember me** control to the login form.
- Unchecked (default): Supabase auth session is stored in `sessionStorage`, so the login survives refreshes in the current browser session but not a future browser session.
- Checked: Supabase auth session is stored in `localStorage`, so the user remains signed in on that trusted device across browser restarts until logout/session expiry.
- A remembered login also preserves the normalized email address for the next login screen; passwords are never stored by this feature.
- Logout clears the Supabase auth token from both local and session storage.
- No backend or SQL migration is required.
