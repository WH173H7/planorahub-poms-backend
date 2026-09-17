BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_record_type') THEN
    CREATE TYPE lead_record_type AS ENUM ('LEAD', 'PROSPECT', 'CLIENT');
  END IF;
END $$;

ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'RESEARCHING';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'CONTACT_FOUND';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'AWAITING_REPLY';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'FOLLOW_UP';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'READY_FOR_PROSPECT_REVIEW';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'DISQUALIFIED';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS record_type lead_record_type,
  ADD COLUMN IF NOT EXISTS pursuit_progress INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_to_prospect_at TIMESTAMPTZ;

-- Preserve everything built before the CEO workflow clarification as prospect data.
UPDATE leads
SET record_type = 'PROSPECT'::lead_record_type
WHERE record_type IS NULL;

ALTER TABLE leads
  ALTER COLUMN record_type SET DEFAULT 'LEAD'::lead_record_type,
  ALTER COLUMN record_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_pursuit_progress_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_pursuit_progress_check
      CHECK (pursuit_progress >= 0 AND pursuit_progress <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_record_type ON leads(record_type);
CREATE INDEX IF NOT EXISTS idx_leads_pool_status ON leads(record_type, stage);
CREATE INDEX IF NOT EXISTS idx_leads_pool_owner ON leads(record_type, assigned_to_id);

COMMIT;
