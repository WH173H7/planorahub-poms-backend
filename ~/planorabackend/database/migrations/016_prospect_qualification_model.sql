BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS business_need_identified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS decision_maker_identified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS budget_indicated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS timeline_known BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS organization_fit BOOLEAN NOT NULL DEFAULT FALSE;

-- Recalculate any existing score into the new qualification model only
-- when the score is currently null. Existing manually entered scores are preserved.
UPDATE leads
SET lead_score =
  (CASE WHEN business_need_identified THEN 20 ELSE 0 END) +
  (CASE WHEN decision_maker_identified THEN 20 ELSE 0 END) +
  (CASE WHEN budget_indicated THEN 20 ELSE 0 END) +
  (CASE WHEN timeline_known THEN 20 ELSE 0 END) +
  (CASE WHEN organization_fit THEN 20 ELSE 0 END)
WHERE lead_score IS NULL;

COMMIT;
