BEGIN;

-- Internal P.O./S.O. number. This is PlanoraHub's own sequential order reference,
-- independent from the customer invoice number.
CREATE SEQUENCE IF NOT EXISTS invoice_order_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE invoice_settings
  ADD COLUMN IF NOT EXISTS sales_order_prefix varchar(40) NOT NULL DEFAULT 'PH-SO';

-- Backfill existing invoices that did not have a P.O./S.O. number.
UPDATE invoices
SET po_number = CONCAT(
  COALESCE((SELECT NULLIF(sales_order_prefix,'') FROM invoice_settings WHERE singleton_key='DEFAULT'), 'PH-SO'),
  '-',
  LPAD(nextval('invoice_order_number_seq')::text, 6, '0')
)
WHERE NULLIF(BTRIM(po_number), '') IS NULL;

-- Custom tax catalogue used by the invoice editor.
CREATE TABLE IF NOT EXISTS invoice_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  rate numeric(7,3) NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rate >= 0 AND rate <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_tax_rates_name_active
  ON invoice_tax_rates(LOWER(name))
  WHERE is_active = true;

INSERT INTO invoice_tax_rates(name,rate,is_system,is_active)
VALUES
  ('VAT 7.5%',7.5,true,true),
  ('WHT 5%',5,true,true),
  ('Tax 10%',10,true,true)
ON CONFLICT DO NOTHING;

-- Finance staff submit payment confirmations; Super Admin approves or rejects them.
ALTER TABLE invoice_payments
  ADD COLUMN IF NOT EXISTS approval_status varchar(24) NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

UPDATE invoice_payments
SET approval_status='APPROVED'
WHERE approval_status IS NULL OR approval_status='';

ALTER TABLE invoice_payments
  ALTER COLUMN approval_status SET DEFAULT 'PENDING_APPROVAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='invoice_payments_approval_status_check'
  ) THEN
    ALTER TABLE invoice_payments
      ADD CONSTRAINT invoice_payments_approval_status_check
      CHECK (approval_status IN ('PENDING_APPROVAL','APPROVED','REJECTED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_payments_approval
  ON invoice_payments(approval_status,created_at DESC);

INSERT INTO permissions(code,name,module,description) VALUES
  ('invoices.approve_payment','Approve invoice payments','finance','Approve or reject payment confirmations submitted by Finance staff.')
ON CONFLICT (code) DO NOTHING;

-- Finance is a protected built-in operational role again.
INSERT INTO roles(code,name,description,is_system_role,is_active)
VALUES(
  'FINANCE',
  'Finance',
  'Built-in finance role. Can create and send invoices and submit payment confirmations for Super Admin approval.',
  TRUE,
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  is_system_role=TRUE,
  is_active=TRUE,
  updated_at=NOW();

-- Finance can operate invoices, but cannot manage business settings or approve payments.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code='FINANCE'
  AND p.code IN ('invoices.read','invoices.create','invoices.send','invoices.record_payment')
ON CONFLICT DO NOTHING;

-- Super Admin remains the payment approver.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code='SUPER_ADMIN'
  AND p.code='invoices.approve_payment'
ON CONFLICT DO NOTHING;

COMMIT;
