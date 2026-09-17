BEGIN;
CREATE TABLE IF NOT EXISTS lead_pursuit_workflows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(180) NOT NULL, description text,
 is_default boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
 created_by_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_default_lead_pursuit_workflow ON lead_pursuit_workflows(is_default) WHERE is_default=true;
CREATE TABLE IF NOT EXISTS lead_pursuit_workflow_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL REFERENCES lead_pursuit_workflows(id) ON DELETE CASCADE,
 title varchar(220) NOT NULL, description text, position integer NOT NULL, evidence_required boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workflow_id, position)
);
ALTER TABLE lead_assignment_batches ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES lead_pursuit_workflows(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS lead_pursuit_instances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 batch_id uuid REFERENCES lead_assignment_batches(id) ON DELETE SET NULL, source_workflow_id uuid REFERENCES lead_pursuit_workflows(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(lead_id, batch_id)
);
CREATE TABLE IF NOT EXISTS lead_pursuit_instance_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL REFERENCES lead_pursuit_instances(id) ON DELETE CASCADE,
 title varchar(220) NOT NULL, description text, position integer NOT NULL, evidence_required boolean NOT NULL DEFAULT false,
 completed boolean NOT NULL DEFAULT false, completed_at timestamptz, completed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
 notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(instance_id, position)
);
CREATE TABLE IF NOT EXISTS lead_pursuit_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), step_id uuid NOT NULL REFERENCES lead_pursuit_instance_steps(id) ON DELETE CASCADE,
 uploaded_by_id uuid REFERENCES users(id) ON DELETE SET NULL, file_name text NOT NULL, storage_path text NOT NULL,
 mime_type text NOT NULL, file_size bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pursuit_instance_lead ON lead_pursuit_instances(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pursuit_step_instance ON lead_pursuit_instance_steps(instance_id, position);

WITH w AS (
 INSERT INTO lead_pursuit_workflows(name,description,is_default)
 SELECT 'Standard Lead Pursuit','PlanoraHub default organization lead pursuit workflow.',true
 WHERE NOT EXISTS (SELECT 1 FROM lead_pursuit_workflows WHERE is_default=true)
 RETURNING id
)
INSERT INTO lead_pursuit_workflow_steps(workflow_id,title,position,evidence_required)
SELECT w.id,s.title,s.position,s.evidence_required FROM w CROSS JOIN (VALUES
 ('Research organization',1,false),('Find primary contact',2,true),('Verify contact details',3,false),
 ('Make initial contact',4,true),('Receive or await response',5,false),('Follow up',6,true),
 ('Arrange meeting',7,false),('Recommend as Prospect',8,true)
) AS s(title,position,evidence_required);
COMMIT;
