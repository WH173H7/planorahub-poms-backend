# P28 — PlanoraHub Invoice Center

## Scope
A PlanoraHub-native invoicing workspace inspired by the operational flow shown in the Wave reference screenshots, while keeping PlanoraHub's own branding, permissions, CRM model, mail infrastructure and audit trail.

## Included
- Invoice Center with Unpaid, Draft and All views
- Search by invoice/customer
- Outstanding, overdue, draft and collected-this-month summaries
- CRM organization/customer picker with billing contact selection
- Invoice editor: issue date, due date, PO/SO number, summary, currency, line items, quantity, price, per-line tax, discounts and notes/terms
- VAT 7.5%, WHT 5%, no-tax and custom 10% choices in the first version
- Draft / unsent invoice lifecycle
- Send invoice by email using existing PlanoraHub mail infrastructure
- Send payment reminders
- Record bank transfer, cash, cheque, card or other payment
- Partial payment and full payment status handling
- Send payment receipt
- Invoice PDF download
- Void invoice
- PlanoraHub invoice business settings: business name, legal name, address, contact details, prefix, default currency, payment terms and bank details
- Dynamic overdue state based on due date and outstanding balance
- Role permissions for read/create/send/record-payment/manage
- Audit events for invoice settings, create/update/send/reminder/payment/receipt/PDF/void operations
- Global search integration and Admin navigation entry

## Database
Run migration 041_invoice_center.sql after migrations 039 and 040.

## Validation
- 17 changed/new TS/TSX integration files source-transpiled with 0 syntax diagnostics.
- globals.css braces balanced: 4439 / 4439.
- Full pnpm dependency-backed builds still need to be run in the user's local checkout before deployment.
