BEGIN;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS invoice_settings (
  singleton_key varchar(32) PRIMARY KEY DEFAULT 'DEFAULT',
  organization_name varchar(220) NOT NULL DEFAULT 'PlanoraHub',
  legal_name varchar(255),
  address text,
  email varchar(255),
  phone varchar(80),
  website text,
  invoice_prefix varchar(40) NOT NULL DEFAULT 'PH-INV',
  default_currency varchar(3) NOT NULL DEFAULT 'NGN',
  default_payment_terms_days integer NOT NULL DEFAULT 30,
  default_notes_terms text,
  bank_account_name varchar(220),
  bank_name varchar(220),
  naira_account varchar(120),
  usd_account varchar(120),
  updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (default_payment_terms_days BETWEEN 0 AND 365)
);

INSERT INTO invoice_settings (
  singleton_key,organization_name,address,email,phone,website)
SELECT
  'DEFAULT',
  COALESCE(NULLIF(organization_name,''),'PlanoraHub'),
  NULLIF(address,''),
  NULLIF(email,''),
  NULLIF(phone,''),
  NULLIF(website,'')
FROM letterhead_settings
WHERE singleton_key='DEFAULT'
ON CONFLICT (singleton_key) DO NOTHING;

INSERT INTO invoice_settings(singleton_key,organization_name)
VALUES('DEFAULT','PlanoraHub')
ON CONFLICT (singleton_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number varchar(80) NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  po_number varchar(120),
  summary varchar(280),
  currency varchar(3) NOT NULL DEFAULT 'NGN',
  discount_type varchar(16) NOT NULL DEFAULT 'NONE',
  discount_value numeric(14,2) NOT NULL DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  balance_due numeric(14,2) NOT NULL DEFAULT 0,
  notes_terms text,
  bill_to_name varchar(220),
  bill_to_contact_name varchar(220),
  bill_to_email varchar(255),
  bill_to_phone varchar(80),
  bill_to_address text,
  sent_at timestamptz,
  last_reminder_at timestamptz,
  voided_at timestamptz,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('DRAFT','UNSENT','SENT','PARTIALLY_PAID','PAID','OVERDUE','VOID')),
  CHECK (discount_type IN ('NONE','FIXED','PERCENT')),
  CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND amount_paid >= 0 AND balance_due >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invoices_organization ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  name varchar(220) NOT NULL,
  description text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(7,3) NOT NULL DEFAULT 0,
  line_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  line_tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity > 0),
  CHECK (unit_price >= 0),
  CHECK (tax_rate >= 0 AND tax_rate <= 100)
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id,position);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT current_date,
  amount numeric(14,2) NOT NULL,
  method varchar(40) NOT NULL DEFAULT 'BANK_TRANSFER',
  account_name varchar(220),
  reference varchar(160),
  memo text,
  receipt_sent_at timestamptz,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount > 0),
  CHECK (method IN ('BANK_TRANSFER','CASH','CHEQUE','CARD','OTHER'))
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id,created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  recipient_email varchar(255),
  provider_id varchar(255),
  delivery_status varchar(20),
  message text,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN ('INVOICE_SENT','REMINDER_SENT','RECEIPT_SENT'))
);
CREATE INDEX IF NOT EXISTS idx_invoice_delivery_events_invoice ON invoice_delivery_events(invoice_id,created_at DESC);

INSERT INTO permissions(code,name,module,description) VALUES
 ('invoices.read','View invoices','finance','View PlanoraHub invoices, balances and payment history.'),
 ('invoices.create','Create invoices','finance','Create and edit draft PlanoraHub invoices.'),
 ('invoices.send','Send invoices','finance','Email invoices and payment reminders to customers.'),
 ('invoices.record_payment','Record invoice payments','finance','Record customer payments and send receipts.'),
 ('invoices.manage','Manage invoices','finance','Void invoices and manage invoice business settings.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code='SUPER_ADMIN'
  AND p.code IN ('invoices.read','invoices.create','invoices.send','invoices.record_payment','invoices.manage')
ON CONFLICT DO NOTHING;

COMMIT;
