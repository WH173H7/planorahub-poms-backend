import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export type LeadStage =
  | 'NEW' | 'ASSIGNED' | 'RESEARCHING' | 'CONTACT_FOUND' | 'CONTACTED'
  | 'AWAITING_REPLY' | 'FOLLOW_UP' | 'ENGAGED' | 'READY_FOR_PROSPECT_REVIEW'
  | 'QUALIFIED' | 'NURTURE' | 'UNQUALIFIED' | 'DISQUALIFIED';
export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type LeadRecordType = 'LEAD' | 'PROSPECT' | 'CLIENT';

export type LeadInput = {
  organizationId: string;
  primaryContactId?: string | null;
  assignedToId?: string | null;
  title: string;
  source?: string | null;
  stage?: LeadStage;
  priority?: LeadPriority;
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
  notes?: string | null;
};

export type OrganizationLeadInput = {
  organizationName: string;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  priority?: LeadPriority;
  notes?: string | null;
};

export type AssignmentInput = { assignedToId: string | null; reason?: string | null };

export type BulkAssignmentInput = {
  leadIds: string[];
  assignedToId: string;
  title: string;
  instructions: string;
  dueAt: string;
  priority: LeadPriority;
  workflowId?: string | null;
  workflowSteps?: Array<{title:string;description?:string|null;evidenceRequired?:boolean}>;
};

@Injectable()
export class LeadsRepository {
  constructor(private readonly db: DatabaseService) {}

  private selectSql() {
    return `
      SELECT l.*, o.name AS organization_name, o.organization_type, o.industry,
        o.website AS organization_website, o.email AS organization_email,
        o.phone AS organization_phone, o.city AS organization_city,
        o.state AS organization_state, o.country AS organization_country,
        c.first_name AS contact_first_name, c.last_name AS contact_last_name,
        c.email AS contact_email, u.first_name AS owner_first_name,
        u.last_name AS owner_last_name, u.email AS owner_email,
        latest_batch.id AS current_assignment_batch_id,
        latest_batch.title AS current_assignment_title,
        latest_batch.task_id AS current_assignment_task_id,
        latest_batch.due_at AS current_assignment_due_at
      FROM leads l
      JOIN organizations o ON o.id = l.organization_id
      LEFT JOIN contacts c ON c.id = l.primary_contact_id
      LEFT JOIN users u ON u.id = l.assigned_to_id
      LEFT JOIN LATERAL (
        SELECT lab.id, lab.title, lab.task_id, lab.due_at
        FROM lead_assignment_batch_items labi
        JOIN lead_assignment_batches lab ON lab.id = labi.batch_id
        WHERE labi.lead_id = l.id
        ORDER BY labi.created_at DESC
        LIMIT 1
      ) latest_batch ON TRUE
    `;
  }

  async list() {
    const result = await this.db.query(`
      ${this.selectSql()}
      WHERE l.record_type = 'LEAD'::lead_record_type
      ORDER BY CASE WHEN l.assigned_to_id IS NULL THEN 0 ELSE 1 END,
        CASE l.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
        l.created_at DESC
    `);
    return result.rows;
  }

  async findById(id: string) {
    const result = await this.db.query(`${this.selectSql()} WHERE l.id = $1 LIMIT 1`, [id]);
    return result.rows[0] ?? null;
  }

  async findLeadPoolByIds(ids: string[]) {
    if (!ids.length) return [];
    const result = await this.db.query(`
      SELECT l.id, l.organization_id, l.assigned_to_id, l.stage, l.priority,
        o.name AS organization_name
      FROM leads l
      JOIN organizations o ON o.id = l.organization_id
      WHERE l.id = ANY($1::uuid[])
        AND l.record_type = 'LEAD'::lead_record_type
      ORDER BY o.name ASC
    `, [ids]);
    return result.rows;
  }

  async findOrganizationDuplicate(name: string, website?: string | null, email?: string | null) {
    const result = await this.db.query(`
      SELECT id, name, website, email FROM organizations
      WHERE status <> 'ARCHIVED' AND (
        LOWER(name) = LOWER($1)
        OR ($2::text IS NOT NULL AND website IS NOT NULL AND LOWER(website) = LOWER($2))
        OR ($3::text IS NOT NULL AND email IS NOT NULL AND LOWER(email) = LOWER($3))
      ) LIMIT 1
    `, [name, website ?? null, email ?? null]);
    return result.rows[0] ?? null;
  }

  async createOrganizationLead(input: OrganizationLeadInput, createdById?: string) {
    const location = (input.location ?? '').trim();
    const result = await this.db.query(`
      WITH new_org AS (
        INSERT INTO organizations (
          name, organization_type, industry, email, phone, website,
          address_line1, notes, created_by_id
        ) VALUES ($1, 'PROSPECT'::organization_type, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, name
      ), new_lead AS (
        INSERT INTO leads (
          organization_id, title, source, stage, priority, notes,
          created_by_id, record_type, pursuit_progress
        )
        SELECT id, name, $9, 'NEW'::lead_stage, $10, $7, $8,
          'LEAD'::lead_record_type, 0
        FROM new_org
        RETURNING *
      )
      SELECT new_lead.*, new_org.name AS organization_name
      FROM new_lead CROSS JOIN new_org
    `, [
      input.organizationName, input.industry ?? null, input.email ?? null,
      input.phone ?? null, input.website ?? null, location || null,
      input.notes ?? null, createdById ?? null, input.source ?? null,
      input.priority ?? 'MEDIUM',
    ]);
    return result.rows[0];
  }

  async organizationExists(id: string) {
    const result = await this.db.query(`SELECT 1 FROM organizations WHERE id=$1 AND status <> 'ARCHIVED' LIMIT 1`, [id]);
    return result.rowCount === 1;
  }
  async contactBelongsToOrganization(contactId: string, organizationId: string) {
    const result = await this.db.query(`SELECT 1 FROM contacts WHERE id=$1 AND organization_id=$2 LIMIT 1`, [contactId, organizationId]);
    return result.rowCount === 1;
  }
  async userExists(id: string) {
    const result = await this.db.query(`SELECT 1 FROM users WHERE id=$1 AND status NOT IN ('DISABLED','SUSPENDED') LIMIT 1`, [id]);
    return result.rowCount === 1;
  }

  async create(input: LeadInput, createdById?: string) {
    const result = await this.db.query(`
      INSERT INTO leads (organization_id, primary_contact_id, assigned_to_id, title, source,
        stage, priority, next_action, next_follow_up_at, notes, created_by_id, record_type,
        first_assigned_at, last_assigned_at)
      VALUES ($1,$2,$3,$4,$5,$6::lead_stage,$7,$8,$9,$10,$11,'LEAD'::lead_record_type,
        CASE WHEN $3::uuid IS NOT NULL THEN NOW() ELSE NULL END,
        CASE WHEN $3::uuid IS NOT NULL THEN NOW() ELSE NULL END)
      RETURNING *
    `, [input.organizationId, input.primaryContactId ?? null, input.assignedToId ?? null,
      input.title, input.source ?? null, input.stage ?? 'NEW', input.priority ?? 'MEDIUM',
      input.nextAction ?? null, input.nextFollowUpAt ?? null, input.notes ?? null, createdById ?? null]);
    return result.rows[0];
  }

  async update(id: string, input: LeadInput) {
    const result = await this.db.query(`
      UPDATE leads SET organization_id=$2, primary_contact_id=$3, title=$4, source=$5,
        stage=$6::lead_stage, priority=$7, next_action=$8, next_follow_up_at=$9,
        notes=$10, updated_at=NOW() WHERE id=$1 RETURNING *
    `, [id, input.organizationId, input.primaryContactId ?? null, input.title, input.source ?? null,
      input.stage ?? 'NEW', input.priority ?? 'MEDIUM', input.nextAction ?? null,
      input.nextFollowUpAt ?? null, input.notes ?? null]);
    return result.rows[0] ?? null;
  }

  async assignmentHistory(id: string) {
    const result = await this.db.query(`
      SELECT la.*, previous_user.first_name AS previous_owner_first_name,
        previous_user.last_name AS previous_owner_last_name,
        assigned_user.first_name AS assigned_to_first_name,
        assigned_user.last_name AS assigned_to_last_name,
        actor.first_name AS assigned_by_first_name, actor.last_name AS assigned_by_last_name
      FROM lead_assignments la
      LEFT JOIN users previous_user ON previous_user.id=la.previous_owner_id
      LEFT JOIN users assigned_user ON assigned_user.id=la.assigned_to_id
      LEFT JOIN users actor ON actor.id=la.assigned_by_id
      WHERE la.lead_id=$1 ORDER BY la.assigned_at DESC
    `, [id]);
    return result.rows;
  }

  async assign(id: string, previousOwnerId: string | null, input: AssignmentInput, assignedById?: string) {
    const result = await this.db.query(`
      UPDATE leads SET assigned_to_id=$2,
        stage=CASE WHEN stage::text='NEW' AND $2::uuid IS NOT NULL THEN 'ASSIGNED'::lead_stage ELSE stage END,
        first_assigned_at=CASE WHEN first_assigned_at IS NULL AND $2::uuid IS NOT NULL THEN NOW() ELSE first_assigned_at END,
        last_assigned_at=CASE WHEN $2::uuid IS NOT NULL THEN NOW() ELSE last_assigned_at END,
        updated_at=NOW() WHERE id=$1 RETURNING *
    `, [id, input.assignedToId]);
    if (!result.rowCount) return null;
    await this.db.query(`INSERT INTO lead_assignments (lead_id, previous_owner_id, assigned_to_id, assigned_by_id, reason)
      VALUES ($1,$2,$3,$4,$5)`, [id, previousOwnerId, input.assignedToId, assignedById ?? null, input.reason ?? null]);
    return this.findById(id);
  }

  async bulkAssign(input: BulkAssignmentInput, assignedById?: string) {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const leadsResult = await client.query(`
        SELECT l.id, l.organization_id, l.assigned_to_id, l.stage, o.name AS organization_name
        FROM leads l
        JOIN organizations o ON o.id = l.organization_id
        WHERE l.id = ANY($1::uuid[])
          AND l.record_type = 'LEAD'::lead_record_type
        FOR UPDATE OF l
      `, [input.leadIds]);

      if (leadsResult.rows.length !== input.leadIds.length) {
        throw new Error('One or more selected leads are no longer available in the Lead Pool');
      }

      const batchResult = await client.query(`
        INSERT INTO lead_assignment_batches (
          title, instructions, assigned_to_id, assigned_by_id, priority, due_at
        ) VALUES ($1,$2,$3,$4,$5::task_priority,$6)
        RETURNING *
      `, [input.title, input.instructions, input.assignedToId, assignedById ?? null, input.priority, input.dueAt]);
      const batch = batchResult.rows[0];

      const workflowId = input.workflowId ?? (await client.query(`SELECT id FROM lead_pursuit_workflows WHERE is_default=true AND is_active=true LIMIT 1`)).rows[0]?.id ?? null;
      let snapshotSteps = input.workflowSteps ?? [];
      if (!snapshotSteps.length && workflowId) {
        snapshotSteps = (await client.query(`SELECT title,description,evidence_required FROM lead_pursuit_workflow_steps WHERE workflow_id=$1 ORDER BY position`,[workflowId])).rows.map((r:any)=>({title:r.title,description:r.description,evidenceRequired:r.evidence_required}));
      }
      await client.query(`UPDATE lead_assignment_batches SET workflow_id=$2 WHERE id=$1`,[batch.id,workflowId]);

      const taskDescription = `${input.instructions}\n\nAssigned organization leads: ${input.leadIds.length}. Open this task to review the assigned lead list and track pursuit progress.`;
      const taskResult = await client.query(`
        INSERT INTO tasks (
          title, description, assigned_to_id, created_by_id,
          status, priority, due_at
        ) VALUES ($1,$2,$3,$4,'TODO'::task_status,$5::task_priority,$6)
        RETURNING *
      `, [input.title, taskDescription, input.assignedToId, assignedById ?? null, input.priority, input.dueAt]);
      const task = taskResult.rows[0];

      await client.query(`
        INSERT INTO task_events (
          task_id, actor_user_id, event_type, message, new_values
        ) VALUES
          ($1,$2,'TASK_CREATED'::task_event_type,'Lead assignment task created',$3::jsonb),
          ($1,$2,'TASK_ASSIGNED'::task_event_type,'Lead assignment assigned — awaiting acceptance',$4::jsonb)
      `, [
        task.id,
        assignedById ?? null,
        JSON.stringify({ batchId: batch.id, leadCount: input.leadIds.length }),
        JSON.stringify({ assignedToId: input.assignedToId, batchId: batch.id }),
      ]);

      await client.query(`UPDATE lead_assignment_batches SET task_id=$2, updated_at=NOW() WHERE id=$1`, [batch.id, task.id]);

      for (const lead of leadsResult.rows) {
        await client.query(`
          INSERT INTO lead_assignment_batch_items (batch_id, lead_id, previous_owner_id)
          VALUES ($1,$2,$3)
        `, [batch.id, lead.id, lead.assigned_to_id ?? null]);

        const instance=(await client.query(`INSERT INTO lead_pursuit_instances(lead_id,batch_id,source_workflow_id) VALUES($1,$2,$3) RETURNING id`,[lead.id,batch.id,workflowId])).rows[0];
        for(let si=0;si<snapshotSteps.length;si++){
          const st=snapshotSteps[si];
          await client.query(`INSERT INTO lead_pursuit_instance_steps(instance_id,title,description,position,evidence_required) VALUES($1,$2,$3,$4,$5)`,[instance.id,st.title,st.description??null,si+1,!!st.evidenceRequired]);
        }

        await client.query(`
          INSERT INTO lead_assignments (
            lead_id, previous_owner_id, assigned_to_id, assigned_by_id, reason
          ) VALUES ($1,$2,$3,$4,$5)
        `, [lead.id, lead.assigned_to_id ?? null, input.assignedToId, assignedById ?? null, `Batch assignment: ${input.title}`]);

        await client.query(`
          UPDATE leads
          SET assigned_to_id=$2,
              stage=CASE WHEN stage::text='NEW' THEN 'ASSIGNED'::lead_stage ELSE stage END,
              first_assigned_at=CASE WHEN first_assigned_at IS NULL THEN NOW() ELSE first_assigned_at END,
              last_assigned_at=NOW(),
              updated_at=NOW()
          WHERE id=$1
        `, [lead.id, input.assignedToId]);
      }

      await client.query('COMMIT');
      return {
        batchId: batch.id,
        taskId: task.id,
        title: input.title,
        assignedToId: input.assignedToId,
        leadCount: input.leadIds.length,
        dueAt: input.dueAt,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
