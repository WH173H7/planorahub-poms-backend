# P28.1 Invoice TypeScript Build Fix

Fixes the backend TypeScript errors reported from `src/invoices/invoices.service.ts` after P28.

## Root cause
`pg` returns invoice rows as `QueryResultRow`. The `get()` method then hydrates that row with `items`, `payments`, and `deliveries`. TypeScript inferred only those explicitly appended collections and dropped the dynamic invoice columns from the return type, so callers reported fields such as `invoice_number`, `balance_due`, `currency`, `status`, and `bill_to_email` as missing.

## Fix
Adds an explicit `InvoiceDetail` hydrated-row type and annotates `get()` as `Promise<InvoiceDetail>` so selected invoice columns and appended collections coexist in the service type.

No SQL migration changes are required. Migration 041 remains the invoice schema migration.
