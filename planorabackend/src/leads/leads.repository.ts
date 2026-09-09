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
  proposedRevenue?: number | null;
  revenueProbability?: number | null;
};

export type LeadImportRow = {
  rowNumber: number;
  organizationName: string;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  priority?: LeadPriority;
  notes?: string | null;
  proposedRevenue?: number | null;
  revenueProbability?: number | null;
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
  proposedRevenue?: number | null;
  revenueProbability?: number | null;
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
        t.name AS assigned_team_name, tm.first_name AS team_lead_first_name, tm.last_name AS team_lead_last_name,
        (l.proposed_revenue * l.revenue_probability / 100.0) AS weighted_revenue,
        latest_batch.id AS current_assignment_batch_id,
        latest_batch.title AS current_assignment_title,
        latest_batch.task_id AS current_assignment_task_id,
        latest_batch.due_at AS current_assignment_due_at
      FROM leads l
      JOIN organizations o ON o.id = l.organization_id
      LEFT JOIN contacts c ON c.id = l.primary_contact_id
      LEFT JOIN users u ON u.id = l.assigned_to_id
      LEFT JOIN teams t ON t.id = l.assigned_team_id
      LEFT JOIN users tm ON tm.id = t.manager_id
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
      ORDER BY CASE WHEN l.assigned_to_id IS NULL AND l.assigned_team_id IS NULL THEN 0 ELSE 1 END,
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
          created_by_id, record_type, pursuit_progress, proposed_revenue, revenue_probability
        )
        SELECT id, name, $9, 'NEW'::lead_stage, $10, $7, $8,
          'LEAD'::lead_record_type, 0, $11, $12
        FROM new_org
        RETURNING *
      )
      SELECT new_lead.*, new_org.name AS organization_name
      FROM new_lead CROSS JOIN new_org
    `, [
      input.organizationName, input.industry ?? null, input.email ?? null,
      input.phone ?? null, input.website ?? null, location || null,
      input.notes ?? null, createdById ?? null, input.source ?? null,
      input.priority ?? 'MEDIUM', input.proposedRevenue ?? 1000000, input.revenueProbability ?? 30,
    ]);
    return result.rows[0];
  }


  async findImportMatches(rows: LeadImportRow[]) {
    if (!rows.length) return [];
    const names = rows.map((row) => row.organizationName.toLowerCase());
    const websites = rows.map((row) => row.website?.toLowerCase() ?? null).filter(Boolean);
    const emails = rows.map((row) => row.email?.toLowerCase() ?? null).filter(Boolean);
    const result = await this.db.query(`
      SELECT o.id, o.name, o.website, o.email, o.organization_type,
        EXISTS (
          SELECT 1 FROM leads l
          WHERE l.organization_id=o.id
            AND l.record_type='LEAD'::lead_record_type
        ) AS has_lead
      FROM organizations o
      WHERE o.status <> 'ARCHIVED' AND (
        LOWER(o.name)=ANY($1::text[])
        OR ($2::text[] IS NOT NULL AND LOWER(COALESCE(o.website,''))=ANY($2::text[]))
        OR ($3::text[] IS NOT NULL AND LOWER(COALESCE(o.email,''))=ANY($3::text[]))
      )
    `, [names, websites.length ? websites : null, emails.length ? emails : null]);
    return result.rows;
  }

  async importOrganizationLeads(rows: Array<LeadImportRow & { action: 'CREATE_NEW' | 'USE_EXISTING'; existingOrganizationId?: string | null }>, createdById?: string) {
    const client = await this.db.getClient();
    const created: Array<{ rowNumber:number; leadId:string; organizationId:string; organizationName:string; reusedOrganization:boolean }> = [];
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        let organizationId = row.existingOrganizationId ?? null;
        let reusedOrganization = false;
        if (row.action === 'USE_EXISTING') {
          if (!organizationId) throw new Error(`Row ${row.rowNumber}: existing organization is required`);
          const existing = await client.query(`SELECT id,name FROM organizations WHERE id=$1 AND status <> 'ARCHIVED' LIMIT 1`, [organizationId]);
          if (!existing.rowCount) throw new Error(`Row ${row.rowNumber}: organization is no longer available`);
          const existingLead = await client.query(`SELECT id FROM leads WHERE organization_id=$1 AND record_type='LEAD'::lead_record_type LIMIT 1`, [organizationId]);
          if (existingLead.rowCount) throw new Error(`Row ${row.rowNumber}: organization already has an active Lead`);
          reusedOrganization = true;
        } else {
          const org = await client.query(`
            INSERT INTO organizations (name, organization_type, industry, email, phone, website, address_line1, notes, created_by_id)
            VALUES ($1,'PROSPECT'::organization_type,$2,$3,$4,$5,$6,$7,$8)
            RETURNING id
          `, [row.organizationName,row.industry??null,row.email??null,row.phone??null,row.website??null,row.location??null,row.notes??null,createdById??null]);
          organizationId = org.rows[0].id;
        }
        const lead = await client.query(`
          INSERT INTO leads (organization_id,title,source,stage,priority,notes,created_by_id,record_type,pursuit_progress,proposed_revenue,revenue_probability)
          VALUES ($1,$2,$3,'NEW'::lead_stage,$4,$5,$6,'LEAD'::lead_record_type,0,$7,$8)
          RETURNING id
        `, [organizationId,row.organizationName,row.source??null,row.priority??'MEDIUM',row.notes??null,createdById??null,row.proposedRevenue??1000000,row.revenueProbability??30]);
        created.push({rowNumber:row.rowNumber,leadId:lead.rows[0].id,organizationId:organizationId!,organizationName:row.organizationName,reusedOrganization});
      }
      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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

  async eligibleOperationalStaff(id: string) {
    const result=await this.db.query(`SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.status='ACTIVE' AND r.code NOT IN ('SUPER_ADMIN','ADMIN') LIMIT 1`,[id]);
    return result.rowCount===1;
  }

  async listOwned(userId:string){const result=await this.db.query(`${this.selectSql()} WHERE l.record_type='LEAD'::lead_record_type AND (l.assigned_to_id=$1 OR EXISTS(SELECT 1 FROM team_members tm2 WHERE tm2.team_id=l.assigned_team_id AND tm2.user_id=$1)) ORDER BY l.next_follow_up_at NULLS LAST,l.updated_at DESC`,[userId]);return result.rows;}
  async findOwnedById(id:string,userId:string){const result=await this.db.query(`${this.selectSql()} WHERE l.id=$1 AND (l.assigned_to_id=$2 OR EXISTS(SELECT 1 FROM team_members tm2 WHERE tm2.team_id=l.assigned_team_id AND tm2.user_id=$2)) LIMIT 1`,[id,userId]);return result.rows[0]??null;}
  async updateStage(id:string,stage:LeadStage){const result=await this.db.query(`UPDATE leads SET stage=$2::lead_stage,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,stage]);return result.rows[0]??null;}
  async updateNextFollowUp(id: string, nextFollowUpAt: string | null) {
    await this.db.query(
      `UPDATE leads SET next_follow_up_at=$2, updated_at=NOW() WHERE id=$1`,
      [id, nextFollowUpAt],
    );
  }
  async myWorkMetrics(userId:string){const result=await this.db.query(`SELECT
    (SELECT count(*)::int FROM leads WHERE assigned_to_id=$1 AND record_type='LEAD') assigned_leads,
    (SELECT count(*)::int FROM leads WHERE assigned_to_id=$1 AND pursuit_progress>0 AND pursuit_progress<100) active_pursuits,
    (SELECT count(*)::int FROM tasks WHERE assigned_to_id=$1 AND status NOT IN ('COMPLETED','CANCELLED') AND due_at>=CURRENT_DATE AND due_at<CURRENT_DATE+INTERVAL '1 day') tasks_due_today,
    (SELECT count(*)::int FROM tasks WHERE assigned_to_id=$1 AND status NOT IN ('COMPLETED','CANCELLED') AND due_at<CURRENT_DATE) overdue_tasks,
    (SELECT count(*)::int FROM activities WHERE assigned_to_id=$1 AND activity_type='FOLLOW_UP' AND status NOT IN ('COMPLETED','CANCELLED') AND scheduled_at>=CURRENT_DATE AND scheduled_at<CURRENT_DATE+INTERVAL '1 day') follow_ups_today,
    (SELECT count(*)::int FROM activities WHERE assigned_to_id=$1 AND activity_type='FOLLOW_UP' AND status NOT IN ('COMPLETED','CANCELLED') AND scheduled_at<CURRENT_DATE) overdue_follow_ups`,[userId]);return result.rows[0];}
  async listOwnedLeadTasks(leadId: string, userId: string) {
    const result = await this.db.query(
      `SELECT id,title,status,priority,due_at,completed_at
       FROM tasks WHERE lead_id=$1 AND assigned_to_id=$2 ORDER BY due_at NULLS LAST,created_at DESC`,
      [leadId, userId],
    );
    return result.rows;
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
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        UPDATE leads SET assigned_to_id=$2,
          stage=CASE WHEN stage::text='NEW' AND $2::uuid IS NOT NULL THEN 'ASSIGNED'::lead_stage ELSE stage END,
          first_assigned_at=CASE WHEN first_assigned_at IS NULL AND $2::uuid IS NOT NULL THEN NOW() ELSE first_assigned_at END,
          last_assigned_at=CASE WHEN $2::uuid IS NOT NULL THEN NOW() ELSE last_assigned_at END,
          updated_at=NOW() WHERE id=$1 RETURNING *
      `, [id, input.assignedToId]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(
        `INSERT INTO lead_assignments (lead_id, previous_owner_id, assigned_to_id, assigned_by_id, reason)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, previousOwnerId, input.assignedToId, assignedById ?? null, input.reason ?? null],
      );
      await client.query('COMMIT');
      return this.findById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }


  async findAssignmentBatchById(id: string) {
    const batchResult = await this.db.query(`
      SELECT
        lab.*,

        assignee.first_name AS assignee_first_name,
        assignee.last_name AS assignee_last_name,
        assignee.email AS assignee_email,
        assignee.job_title AS assignee_job_title,

        creator.first_name AS creator_first_name,
        creator.last_name AS creator_last_name,
        creator.email AS creator_email,

        workflow.name AS workflow_name,

        t.status AS task_status,
        t.completed_at AS task_completed_at,

        COUNT(labi.id)::int AS lead_count,

        COALESCE(
          ROUND(AVG(COALESCE(l.pursuit_progress, 0)))
        , 0)::int AS average_progress,

        COUNT(*) FILTER (
          WHERE l.stage::text NOT IN ('NEW', 'ASSIGNED')
        )::int AS active_lead_count,

        COUNT(*) FILTER (
          WHERE l.pursuit_progress = 100
        )::int AS completed_pursuit_count

      FROM lead_assignment_batches lab

      LEFT JOIN users assignee
        ON assignee.id = lab.assigned_to_id

      LEFT JOIN users creator
        ON creator.id = lab.assigned_by_id

      LEFT JOIN lead_pursuit_workflows workflow
        ON workflow.id = lab.workflow_id

      LEFT JOIN tasks t
        ON t.id = lab.task_id

      LEFT JOIN lead_assignment_batch_items labi
        ON labi.batch_id = lab.id

      LEFT JOIN leads l
        ON l.id = labi.lead_id

      WHERE lab.id = $1

      GROUP BY
        lab.id,
        assignee.id,
        creator.id,
        workflow.id,
        t.id

      LIMIT 1
    `, [id]);

    const batch = batchResult.rows[0] as ({ task_id: string | null } & Record<string, unknown>) | undefined;

    if (!batch) return null;

    const leadsResult = await this.db.query(`
      SELECT
        l.id,
        l.organization_id,
        l.title,
        l.stage,
        l.priority,
        l.pursuit_progress,
        l.assigned_to_id,
        l.next_action,
        l.next_follow_up_at,

        o.name AS organization_name,
        o.industry AS organization_industry,
        o.website AS organization_website,

        labi.previous_owner_id,
        labi.created_at AS assigned_at,

        previous_owner.first_name AS previous_owner_first_name,
        previous_owner.last_name AS previous_owner_last_name,
        current_owner.first_name AS current_owner_first_name,
        current_owner.last_name AS current_owner_last_name

      FROM lead_assignment_batch_items labi

      JOIN leads l
        ON l.id = labi.lead_id

      JOIN organizations o
        ON o.id = l.organization_id

      LEFT JOIN users previous_owner
        ON previous_owner.id = labi.previous_owner_id

      LEFT JOIN users current_owner
        ON current_owner.id = l.assigned_to_id

      WHERE labi.batch_id = $1

      ORDER BY
        CASE l.priority
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        o.name ASC
    `, [id]);

    return {
      ...batch,
      leads: leadsResult.rows,
    };
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
  async availablePool(userId:string){
    const result=await this.db.query(`${this.selectSql()} WHERE l.record_type='LEAD'::lead_record_type AND l.assigned_to_id IS NULL AND l.assigned_team_id IS NULL AND l.stage='NEW' ORDER BY l.priority DESC,l.proposed_revenue DESC,l.created_at DESC`);
    return result.rows;
  }
  async claimLead(id:string,userId:string){
    const result=await this.db.query(`UPDATE leads SET assigned_to_id=$2,claimed_by_id=$2,claimed_at=NOW(),stage='ASSIGNED',updated_at=NOW() WHERE id=$1 AND record_type='LEAD' AND assigned_to_id IS NULL AND assigned_team_id IS NULL RETURNING *`,[id,userId]);
    return result.rows[0]??null;
  }
  async teamExists(teamId:string){
    const result=await this.db.query(`SELECT EXISTS(SELECT 1 FROM teams WHERE id=$1 AND is_active=true) AS exists`,[teamId]);
    return Boolean(result.rows[0]?.exists);
  }
  async assignTeam(id:string,teamId:string|null){
    const result=await this.db.query(`UPDATE leads SET assigned_team_id=$2,assigned_to_id=NULL,stage=CASE WHEN $2::uuid IS NULL THEN 'NEW'::lead_stage ELSE 'ASSIGNED'::lead_stage END,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,teamId]);
    return result.rows[0]??null;
  }
  async updateRevenue(id:string,proposed:number,probability:number,actual:number|null){
    const result=await this.db.query(`UPDATE leads SET proposed_revenue=$2,revenue_probability=$3,actual_revenue=$4,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,proposed,probability,actual]);
    return result.rows[0]??null;
  }

}
