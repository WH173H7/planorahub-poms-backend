# P28.6 — Mail composer viewport fix

- Adds an explicit `is-composing` state to the right mail pane.
- On desktop, the compose pane is a full-height flex column.
- Header/template/footer remain reachable while only the form fields scroll.
- Send email / Save draft / Close composer are therefore always visible.
- Tablet/mobile keeps normal page flow with a sticky action footer.
- No backend or SQL changes.
