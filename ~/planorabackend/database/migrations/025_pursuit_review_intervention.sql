BEGIN;

-- ============================================================
-- P5: Pursuit Review & Intervention
-- ============================================================

-- Distinguishes workflow snapshot steps from Lead-specific
-- staff/admin additions.
ALTER TABLE lead_pursuit_instance_steps
  ADD COLUMN IF NOT EXISTS step_origin varchar(30) NOT NULL DEFAULT 'WORKFLOW',
  ADD COLUMN IF NOT EXISTS added_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_status varchar(30) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS retake_reason text,
  ADD COLUMN IF NOT EXISTS retake_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS retake_requested_by_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE lead_pursuit_instance_steps
  DROP CONSTRAINT IF EXISTS lead_pursuit_instance_steps_origin_check;

ALTER TABLE lead_pursuit_instance_steps
  ADD CONSTRAINT lead_pursuit_instance_steps_origin_check
  CHECK (step_origin IN ('WORKFLOW', 'STAFF_CUSTOM', 'ADMIN_REQUIRED'));

ALTER TABLE lead_pursuit_instance_steps
  DROP CONSTRAINT IF EXISTS lead_pursuit_instance_steps_review_status_check;

ALTER TABLE lead_pursuit_instance_steps
  ADD CONSTRAINT lead_pursuit_instance_steps_review_status_check
  CHECK (
    review_status IN (
      'PENDING',
      'SUBMITTED',
      'APPROVED',
      'RETAKE_REQUIRED'
    )
  );

-- Existing workflow-snapshot steps remain workflow steps.
UPDATE lead_pursuit_instance_steps
SET step_origin = 'WORKFLOW'
WHERE step_origin IS NULL
   OR step_origin NOT IN ('WORKFLOW', 'STAFF_CUSTOM', 'ADMIN_REQUIRED');

-- Evidence is required for every currently incomplete pursuit step.
-- Completed historical steps are deliberately not rewritten.
UPDATE lead_pursuit_instance_steps
SET evidence_required = true
WHERE completed = false;

-- All workflow template steps become evidence-required going forward.
UPDATE lead_pursuit_workflow_steps
SET evidence_required = true
WHERE evidence_required = false;

-- ============================================================
-- Immutable submission history
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_pursuit_step_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  step_id uuid NOT NULL
    REFERENCES lead_pursuit_instance_steps(id)
    ON DELETE CASCADE,

  submitted_by_id uuid
    REFERENCES users(id)
    ON DELETE SET NULL,

  notes text,

  submission_number integer NOT NULL,

  submitted_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(step_id, submission_number)
);

CREATE INDEX IF NOT EXISTS idx_pursuit_submission_step
  ON lead_pursuit_step_submissions(step_id, submitted_at DESC);

-- Snapshot evidence attached at the time of a submission.
CREATE TABLE IF NOT EXISTS lead_pursuit_submission_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  submission_id uuid NOT NULL
    REFERENCES lead_pursuit_step_submissions(id)
    ON DELETE CASCADE,

  evidence_id uuid
    REFERENCES lead_pursuit_evidence(id)
    ON DELETE SET NULL,

  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pursuit_submission_evidence_submission
  ON lead_pursuit_submission_evidence(submission_id);

-- ============================================================
-- Admin comments / review discussion
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_pursuit_step_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  step_id uuid NOT NULL
    REFERENCES lead_pursuit_instance_steps(id)
    ON DELETE CASCADE,

  author_id uuid
    REFERENCES users(id)
    ON DELETE SET NULL,

  body text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pursuit_comment_step
  ON lead_pursuit_step_comments(step_id, created_at ASC);

COMMIT;
