BEGIN;

-- ============================================================
-- P24 LEAD POOL + LIFECYCLE COMMERCIAL MODEL
-- Leads are operational pursuit records only. Commercial value begins
-- when a Lead is recommended/approved as a Prospect.
-- ============================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS available_in_pool boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pool_published_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pool_published_by_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_revenue numeric(16,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_revenue_recorded_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_revenue_recorded_by_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_pool_published_by_id_fkey'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_pool_published_by_id_fkey
      FOREIGN KEY (pool_published_by_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_client_revenue_recorded_by_id_fkey'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_client_revenue_recorded_by_id_fkey
      FOREIGN KEY (client_revenue_recorded_by_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_expected_revenue_nonnegative'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_expected_revenue_nonnegative
      CHECK (expected_revenue IS NULL OR expected_revenue >= 0);
  END IF;
END
$$;

-- Preserve commercial context for records that had already progressed
-- before this model was introduced.
UPDATE leads
SET expected_revenue = NULLIF(proposed_revenue, 0)
WHERE record_type IN ('PROSPECT','CLIENT')
  AND expected_revenue IS NULL;

-- Lead records no longer carry commercial value. Keep legacy columns for
-- compatibility with historic reports, but zero them while the record is a Lead.
UPDATE leads
SET proposed_revenue = 0,
    revenue_probability = 0,
    actual_revenue = NULL
WHERE record_type = 'LEAD';

ALTER TABLE leads
  ALTER COLUMN proposed_revenue SET DEFAULT 0,
  ALTER COLUMN revenue_probability SET DEFAULT 0;

-- Existing unassigned Leads remain unassigned. Admin explicitly decides which Leads enter the shared Lead Pool.

CREATE INDEX IF NOT EXISTS idx_leads_staff_pool
  ON leads(record_type, available_in_pool, assigned_to_id, assigned_team_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_expected_revenue
  ON leads(record_type, expected_revenue)
  WHERE expected_revenue IS NOT NULL;

COMMIT;
