# P28.2 — Finance invoice workflow

- P.O./S.O. reference is backend-generated from an independent sequence (`PH-SO-######` by default).
- Invoice email can be left blank. When Send/Remind is requested without a saved contact email, the UI asks for a recipient and stores it on the invoice snapshot.
- Custom tax rates are managed by Super Admin from Invoice settings and appear in the invoice item tax dropdown.
- Invoice issuing/PDF/email is blocked until Account number, Bank name and Account name are configured.
- Built-in Finance role is reactivated and receives invoice read/create/send/payment-submission access.
- Finance payment confirmations are `PENDING_APPROVAL`; Super Admin approves/rejects them. Only approved payments change `amount_paid`/`balance_due` and collected totals.
- Super Admin receives an in-app notification when Finance submits a payment confirmation.
- Invoice pages use `area="auto"`; Finance users see Invoices in the staff navigation only when they have `invoices.read`.

Required migration: `042_invoice_finance_workflow.sql` after migration 041.
