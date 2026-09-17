# P28.5 — Mail workspace scroll fix

- Fixes the desktop Mail reader/composer being clipped before the lower fields and Send controls.
- Gives the three-column Mail workspace an explicit viewport-aware height on desktop.
- Adds `min-height: 0` to the grid/flex children that must be allowed to shrink.
- Makes the message list and right-side reader their own reliable scroll containers.
- Keeps the compose footer sticky at the bottom of the right-side reader.
- Restores normal document scrolling on tablet/mobile breakpoints so the desktop containment rules do not trap content.
- Adds a subtle visible scrollbar affordance for the mail reader and conversation list.

No backend or SQL migration changes.
