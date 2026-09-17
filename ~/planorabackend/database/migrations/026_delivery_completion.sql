BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_to_client_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_client_conversion
  ON leads (record_type, converted_to_client_at DESC)
  WHERE record_type = 'CLIENT'::lead_record_type;

COMMIT;
