BEGIN;

-- ============================================================
-- P29 — Configurable Pursuit Workflow 2.0
-- Keep the existing Lead -> Pursuit architecture. Add structured
-- stage schemas, stage responses, task gates and a unified timeline.
-- ============================================================

ALTER TABLE lead_pursuit_workflow_steps
  ADD COLUMN IF NOT EXISTS guidance text,
  ADD COLUMN IF NOT EXISTS form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evidence_min_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS task_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_tasks_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transition_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE lead_pursuit_workflow_steps
  DROP CONSTRAINT IF EXISTS lead_pursuit_workflow_steps_evidence_min_count_check;
ALTER TABLE lead_pursuit_workflow_steps
  ADD CONSTRAINT lead_pursuit_workflow_steps_evidence_min_count_check
  CHECK (evidence_min_count >= 0);

ALTER TABLE lead_pursuit_instance_steps
  ADD COLUMN IF NOT EXISTS guidance text,
  ADD COLUMN IF NOT EXISTS form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evidence_min_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS task_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_tasks_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transition_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE lead_pursuit_instance_steps
  DROP CONSTRAINT IF EXISTS lead_pursuit_instance_steps_evidence_min_count_check;
ALTER TABLE lead_pursuit_instance_steps
  ADD CONSTRAINT lead_pursuit_instance_steps_evidence_min_count_check
  CHECK (evidence_min_count >= 0);

CREATE TABLE IF NOT EXISTS lead_pursuit_step_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES lead_pursuit_instance_steps(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocks_completion boolean NOT NULL DEFAULT false,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(step_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_pursuit_step_tasks_step
  ON lead_pursuit_step_tasks(step_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pursuit_step_tasks_task
  ON lead_pursuit_step_tasks(task_id);

CREATE TABLE IF NOT EXISTS lead_pursuit_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES lead_pursuit_instances(id) ON DELETE CASCADE,
  step_id uuid REFERENCES lead_pursuit_instance_steps(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(60) NOT NULL,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pursuit_timeline_instance
  ON lead_pursuit_timeline_events(instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pursuit_timeline_step
  ON lead_pursuit_timeline_events(step_id, created_at DESC);

-- Existing snapshots remain untouched. New assignments snapshot the
-- configurable schema from the workflow template.

-- ============================================================
-- Upgrade the current default workflow to the CEO-approved journey.
-- Existing active pursuits keep their historical snapshot.
-- ============================================================

DO $p29$
DECLARE
  wid uuid;
BEGIN
  SELECT id INTO wid
  FROM lead_pursuit_workflows
  WHERE is_default = true AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF wid IS NOT NULL THEN
    UPDATE lead_pursuit_workflow_steps
    SET
      title = CASE position
        WHEN 1 THEN 'Research'
        WHEN 2 THEN 'Contacted'
        WHEN 3 THEN 'Engaged'
        WHEN 4 THEN 'Meeting / Discovery'
        WHEN 5 THEN 'Demo'
        WHEN 6 THEN 'Proposal'
        WHEN 7 THEN 'Negotiation'
        WHEN 8 THEN 'Qualified / Conversion'
        ELSE title
      END,
      description = CASE position
        WHEN 1 THEN 'Validate the organisation and document the specific event or programme creating the commercial reason for the pursuit.'
        WHEN 2 THEN 'Record the initial outreach, person contacted, response and the next commitment.'
        WHEN 3 THEN 'Capture meaningful engagement, interest and the next commercial action.'
        WHEN 4 THEN 'Document the discovery conversation, requirements, pain points and commercial context.'
        WHEN 5 THEN 'Record what was demonstrated, client feedback, interest and the next action.'
        WHEN 6 THEN 'Record the proposal, scope, commercial position and client feedback.'
        WHEN 7 THEN 'Track active commercial negotiation, objections, agreed points and open items.'
        WHEN 8 THEN 'Capture the evidence supporting qualification and the agreed conversion path.'
        ELSE description
      END,
      guidance = CASE position
        WHEN 1 THEN 'Complete the research form before moving the pursuit forward. Attach evidence supporting the event, organisation and contact research.'
        WHEN 2 THEN 'Record the real outreach outcome. A message sent without a traceable response or follow-up should not be treated as meaningful engagement.'
        WHEN 3 THEN 'Document substantive engagement and make the next commitment visible.'
        WHEN 4 THEN 'Record the discovery outcome, requirements and decision-maker involvement.'
        WHEN 5 THEN 'Record the demonstration and the client response, not only that a demo occurred.'
        WHEN 6 THEN 'Attach or reference the proposal and record the commercial response.'
        WHEN 7 THEN 'Keep objections, agreed points and outstanding commercial items traceable.'
        WHEN 8 THEN 'Qualification is evidence-based. Do not treat a verbal promise as realised revenue.'
        ELSE guidance
      END,
      comments_enabled = true,
      evidence_min_count = 1,
      task_required = false,
      require_tasks_complete = false,
      follow_up_required = CASE WHEN position IN (2,3,4,5,6,7) THEN true ELSE false END,
      transition_requirements = '{}'::jsonb,
      form_fields = CASE position
        WHEN 1 THEN $$[
          {"key":"target_event","label":"Target Event","type":"text","required":true,"placeholder":"e.g. WIMBIZ Annual Conference 2026"},
          {"key":"event_date","label":"Event Date","type":"date","required":true},
          {"key":"event_type","label":"Event Type","type":"select","required":true,"options":["Conference","Exhibition","Awards","AGM","Corporate Event","Training","Other"]},
          {"key":"expected_attendance","label":"Expected Attendance","type":"number","required":true,"min":1},
          {"key":"opportunity_value","label":"Opportunity Value","type":"currency","required":true,"min":0,"helpText":"Estimated potential PlanoraHub commercial value. This is pipeline context, not realised revenue."},
          {"key":"current_event_technology_process","label":"Current Event Technology / Process","type":"textarea","required":true,"placeholder":"How does the organisation currently plan and run the event?"},
          {"key":"planorahub_modules_required","label":"PlanoraHub Modules Required","type":"multiselect","required":true,"options":["Qwikly Live","Registration","Event Operations","Guest Management","Communications","Other"]},
          {"key":"primary_contact","label":"Primary Contact","type":"contact","required":false},
          {"key":"contact_title","label":"Contact Title","type":"text","required":false},
          {"key":"contact_source","label":"Contact Source","type":"select","required":false,"options":["Founder Research","Referral","LinkedIn","Website","Event Research","Inbound","Other"]},
          {"key":"organization_website","label":"Organisation Website","type":"url","required":false},
          {"key":"research_findings","label":"Research Findings","type":"textarea","required":true,"placeholder":"Summarise the relevant research and why this pursuit is worth pursuing."}
        ]$$::jsonb
        WHEN 2 THEN $$[
          {"key":"contact_method","label":"Contact Method","type":"select","required":true,"options":["Email","Phone","LinkedIn","WhatsApp","In Person","Other"]},
          {"key":"contact_date","label":"Contact Date","type":"date","required":true},
          {"key":"person_contacted","label":"Person Contacted","type":"contact","required":true},
          {"key":"response","label":"Response","type":"select","required":true,"options":["No Response","Positive","Neutral","Negative","Referred"]},
          {"key":"response_details","label":"Response Details","type":"textarea","required":true},
          {"key":"next_follow_up_at","label":"Next Follow-up","type":"datetime","required":true}
        ]$$::jsonb
        WHEN 3 THEN $$[
          {"key":"engagement_date","label":"Engagement Date","type":"date","required":true},
          {"key":"engagement_type","label":"Engagement Type","type":"select","required":true,"options":["Call","Meeting","Email","Demo Discussion","Referral","Other"]},
          {"key":"person_engaged","label":"Person Engaged","type":"contact","required":true},
          {"key":"engagement_summary","label":"Engagement Summary","type":"textarea","required":true},
          {"key":"interest_level","label":"Interest Level","type":"select","required":true,"options":["Low","Medium","High","Very High"]},
          {"key":"next_action","label":"Next Action","type":"textarea","required":true},
          {"key":"next_follow_up_at","label":"Next Follow-up","type":"datetime","required":true}
        ]$$::jsonb
        WHEN 4 THEN $$[
          {"key":"meeting_date","label":"Meeting / Discovery Date","type":"datetime","required":true},
          {"key":"meeting_type","label":"Meeting Type","type":"select","required":true,"options":["Discovery","Onsite","Virtual","Executive Meeting","Other"]},
          {"key":"attendees","label":"Attendees","type":"textarea","required":true},
          {"key":"decision_maker_present","label":"Decision Maker Present","type":"checkbox","required":true},
          {"key":"requirements_identified","label":"Requirements Identified","type":"textarea","required":true},
          {"key":"pain_points","label":"Pain Points","type":"textarea","required":true},
          {"key":"current_process_problems","label":"Current Process / Problems","type":"textarea","required":true},
          {"key":"commercial_requirements","label":"Commercial Requirements","type":"textarea","required":false},
          {"key":"next_follow_up_at","label":"Next Follow-up","type":"datetime","required":true}
        ]$$::jsonb
        WHEN 5 THEN $$[
          {"key":"demo_date","label":"Demo Date","type":"datetime","required":true},
          {"key":"modules_demonstrated","label":"Modules Demonstrated","type":"multiselect","required":true,"options":["Qwikly Live","Registration","Event Operations","Guest Management","Communications","Other"]},
          {"key":"client_feedback","label":"Client Feedback","type":"textarea","required":true},
          {"key":"interest_level","label":"Interest Level","type":"select","required":true,"options":["Low","Medium","High","Very High"]},
          {"key":"next_action","label":"Next Action","type":"textarea","required":true},
          {"key":"next_follow_up_at","label":"Next Follow-up","type":"datetime","required":true}
        ]$$::jsonb
        WHEN 6 THEN $$[
          {"key":"proposal_date","label":"Proposal Date","type":"date","required":true},
          {"key":"proposal_value","label":"Proposal Value","type":"currency","required":true,"min":0},
          {"key":"scope","label":"Proposal Scope","type":"textarea","required":true},
          {"key":"proposal_status","label":"Proposal Status","type":"select","required":true,"options":["Draft","Sent","Under Review","Revised","Accepted","Declined"]},
          {"key":"client_feedback","label":"Client Feedback","type":"textarea","required":true},
          {"key":"next_commercial_action","label":"Next Commercial Action","type":"textarea","required":true},
          {"key":"next_follow_up_at","label":"Next Follow-up","type":"datetime","required":true}
        ]$$::jsonb
        WHEN 7 THEN $$[
          {"key":"negotiation_date","label":"Negotiation Date","type":"date","required":true},
          {"key":"decision_maker_position","label":"Decision Maker Position","type":"text","required":true},
          {"key":"commercial_position","label":"Commercial Position","type":"textarea","required":true},
          {"key":"client_objections","label":"Client Objections","type":"textarea","required":false},
          {"key":"agreed_points","label":"Agreed Points","type":"textarea","required":true},
          {"key":"open_items","label":"Open Items","type":"textarea","required":true},
          {"key":"next_follow_up_at","label":"Next Follow-up","type":"datetime","required":true}
        ]$$::jsonb
        WHEN 8 THEN $$[
          {"key":"qualification_date","label":"Qualification Date","type":"date","required":true},
          {"key":"qualification_summary","label":"Qualification Summary","type":"textarea","required":true},
          {"key":"commercial_evidence","label":"Commercial Evidence","type":"textarea","required":true,"helpText":"Record the evidence supporting a credible commercial opportunity. Do not treat a verbal promise as realised revenue."},
          {"key":"conversion_path","label":"Conversion Path","type":"select","required":true,"options":["Prospect Review","Direct Conversion Review","Deferred","Disqualified"]},
          {"key":"conversion_notes","label":"Conversion Notes","type":"textarea","required":false},
          {"key":"next_action","label":"Next Action","type":"textarea","required":true}
        ]$$::jsonb
        ELSE form_fields
      END
    WHERE workflow_id = wid;

    -- If an older/custom default had fewer than eight stages, leave its
    -- additional configuration intact rather than inventing missing rows.
  END IF;
END $p29$;

-- Existing Pursuit snapshots are deliberately not rewritten. New assignments
-- receive the configured schema; historical records remain auditable as they were.

COMMIT;
