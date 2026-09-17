BEGIN;

CREATE TABLE IF NOT EXISTS lead_assignment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(220) NOT NULL,
  instructions TEXT NOT NULL,
  assigned_to_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  priority task_priority NOT NULL DEFAULT 'MEDIUM',
  due_at TIMESTAMPTZ NOT NULL,
  task_id UUID UNIQUE REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_assignment_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES lead_assignment_batches(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  previous_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_batches_staff
  ON lead_assignment_batches(assigned_to_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_batches_due
  ON lead_assignment_batches(due_at);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_batch_items_batch
  ON lead_assignment_batch_items(batch_id);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_batch_items_lead
  ON lead_assignment_batch_items(lead_id, created_at DESC);

COMMIT;
