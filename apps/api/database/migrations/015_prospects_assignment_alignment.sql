BEGIN;

-- Expand the existing lead_stage enum without breaking existing rows.
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'ENGAGED';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'QUALIFIED';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'MEETING';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'PROPOSAL';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'WON';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'NURTURE';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'UNQUALIFIED';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS lead_score INTEGER,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS competitor_name VARCHAR(180),
  ADD COLUMN IF NOT EXISTS competitor_notes TEXT,
  ADD COLUMN IF NOT EXISTS first_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_priority_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_priority_check
      CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_score_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_score_check
      CHECK (lead_score IS NULL OR (lead_score >= 0 AND lead_score <= 100));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  previous_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead
  ON lead_assignments(lead_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_assigned_to
  ON lead_assignments(assigned_to_id);

-- Normalize legacy stage values into the company-required workflow.
UPDATE leads SET stage = 'ENGAGED' WHERE stage::text = 'INTERESTED';
UPDATE leads SET stage = 'MEETING' WHERE stage::text = 'DEMO_SCHEDULED';
UPDATE leads SET stage = 'PROPOSAL' WHERE stage::text = 'PROPOSAL_SENT';
UPDATE leads SET stage = 'WON' WHERE stage::text = 'CONVERTED';

-- Existing assigned leads get assignment timestamps.
UPDATE leads
SET
  first_assigned_at = COALESCE(first_assigned_at, created_at),
  last_assigned_at = COALESCE(last_assigned_at, created_at)
WHERE assigned_to_id IS NOT NULL;

-- Seed assignment history for existing assigned leads only when none exists.
INSERT INTO lead_assignments (
  lead_id,
  previous_owner_id,
  assigned_to_id,
  assigned_by_id,
  reason,
  assigned_at
)
SELECT
  l.id,
  NULL,
  l.assigned_to_id,
  l.created_by_id,
  'Initial assignment history backfill',
  COALESCE(l.first_assigned_at, l.created_at)
FROM leads l
WHERE l.assigned_to_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lead_assignments la
    WHERE la.lead_id = l.id
  );

INSERT INTO permissions (code, name, module, description)
VALUES
  (
    'leads.assign',
    'Assign prospects',
    'leads',
    'Assign or reassign prospects and preserve assignment history.'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND p.code = 'leads.assign'
ON CONFLICT DO NOTHING;

COMMIT;
