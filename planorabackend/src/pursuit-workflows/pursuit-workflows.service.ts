import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { TasksService } from '../tasks/tasks.service.js';

type Ctx = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type File = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type CustomStepOrigin = 'STAFF_CUSTOM' | 'ADMIN_REQUIRED';

type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'contact';

type PursuitField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  options?: string[];
  min?: number | null;
  max?: number | null;
};

const bucket = 'task-attachments';

const allowed = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const fieldTypes = new Set<FieldType>([
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'datetime',
  'select',
  'multiselect',
  'checkbox',
  'url',
  'email',
  'phone',
  'contact',
]);

@Injectable()
export class PursuitWorkflowsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseService,
    private readonly tasks: TasksService,
  ) {}

  // ============================================================
  // WORKFLOW TEMPLATES
  // ============================================================

  async list() {
    const rows = (
      await this.db.query(`
        SELECT
          w.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', s.id,
                'title', s.title,
                'description', s.description,
                'position', s.position,
                'evidence_required', s.evidence_required,
                'guidance', s.guidance,
                'form_fields', s.form_fields,
                'comments_enabled', s.comments_enabled,
                'evidence_min_count', s.evidence_min_count,
                'task_required', s.task_required,
                'require_tasks_complete', s.require_tasks_complete,
                'follow_up_required', s.follow_up_required,
                'transition_requirements', s.transition_requirements
              )
              ORDER BY s.position
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'::json
          ) AS steps
        FROM lead_pursuit_workflows w
        LEFT JOIN lead_pursuit_workflow_steps s
          ON s.workflow_id = w.id
        WHERE w.is_active = true
        GROUP BY w.id
        ORDER BY w.is_default DESC, w.name
      `)
    ).rows;

    return rows;
  }

  async create(body: any, ctx: Ctx) {
    const name = this.clean(body.name);
    const steps = this.normalizeWorkflowSteps(body.steps);

    if (!name || !steps.length) {
      throw new BadRequestException(
        'Workflow name and at least one stage are required',
      );
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const workflow = (
        await client.query(
          `
            INSERT INTO lead_pursuit_workflows(name, description, created_by_id)
            VALUES($1, $2, $3)
            RETURNING *
          `,
          [name, this.clean(body.description), ctx.actorUserId ?? null],
        )
      ).rows[0];

      await this.insertWorkflowSteps(client, workflow.id, steps);
      await client.query('COMMIT');

      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action: 'PURSUIT_WORKFLOW_CREATED',
        module: 'leads',
        entityType: 'lead_pursuit_workflow',
        entityId: workflow.id,
        newValues: { name, description: this.clean(body.description), steps },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return workflow;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: string, body: any, ctx: Ctx) {
    const current = (
      await this.db.query(
        `SELECT * FROM lead_pursuit_workflows WHERE id=$1 AND is_active=true`,
        [id],
      )
    ).rows[0];

    if (!current) throw new NotFoundException('Workflow not found');

    const name = this.clean(body.name);
    const steps = this.normalizeWorkflowSteps(body.steps);
    if (!name || !steps.length) {
      throw new BadRequestException(
        'Workflow name and at least one stage are required',
      );
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const updated = (
        await client.query(
          `
            UPDATE lead_pursuit_workflows
            SET name=$2, description=$3, updated_at=NOW()
            WHERE id=$1
            RETURNING *
          `,
          [id, name, this.clean(body.description)],
        )
      ).rows[0];

      await client.query(
        `DELETE FROM lead_pursuit_workflow_steps WHERE workflow_id=$1`,
        [id],
      );
      await this.insertWorkflowSteps(client, id, steps);
      await client.query('COMMIT');

      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action: 'PURSUIT_WORKFLOW_UPDATED',
        module: 'leads',
        entityType: 'lead_pursuit_workflow',
        entityId: id,
        oldValues: current,
        newValues: { name, description: this.clean(body.description), steps },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setDefault(id: string, ctx: Ctx) {
    const workflow = (
      await this.db.query(
        `SELECT * FROM lead_pursuit_workflows WHERE id=$1 AND is_active=true`,
        [id],
      )
    ).rows[0];
    if (!workflow) throw new NotFoundException('Workflow not found');

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE lead_pursuit_workflows SET is_default=false, updated_at=NOW() WHERE is_default=true`,
      );
      const updated = (
        await client.query(
          `UPDATE lead_pursuit_workflows SET is_default=true, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id],
        )
      ).rows[0];
      await client.query('COMMIT');

      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action: 'PURSUIT_WORKFLOW_SET_DEFAULT',
        module: 'leads',
        entityType: 'lead_pursuit_workflow',
        entityId: id,
        oldValues: { isDefault: workflow.is_default },
        newValues: { isDefault: true },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(id: string, ctx: Ctx) {
    const workflow = (
      await this.db.query(`SELECT * FROM lead_pursuit_workflows WHERE id=$1`, [id])
    ).rows[0];
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (workflow.is_default) {
      throw new BadRequestException(
        'Choose another default workflow before archiving this workflow.',
      );
    }

    await this.db.query(
      `UPDATE lead_pursuit_workflows SET is_active=false,is_default=false,updated_at=NOW() WHERE id=$1`,
      [id],
    );

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'PURSUIT_WORKFLOW_ARCHIVED',
      module: 'leads',
      entityType: 'lead_pursuit_workflow',
      entityId: id,
      oldValues: workflow,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { id };
  }

  // ============================================================
  // PURSUIT READ MODEL
  // ============================================================

  async getLeadPursuit(leadId: string) {
    const instance = (
      await this.db.query(
        `
          SELECT i.*, w.name AS workflow_name, w.description AS workflow_description
          FROM lead_pursuit_instances i
          LEFT JOIN lead_pursuit_workflows w ON w.id=i.source_workflow_id
          WHERE i.lead_id=$1
          ORDER BY i.created_at DESC
          LIMIT 1
        `,
        [leadId],
      )
    ).rows[0];

    if (!instance) return null;

    const steps = (
      await this.db.query(
        `
          SELECT
            s.*,
            completed_user.first_name AS completed_by_first_name,
            completed_user.last_name AS completed_by_last_name,
            added_user.first_name AS added_by_first_name,
            added_user.last_name AS added_by_last_name,
            retake_user.first_name AS retake_requested_by_first_name,
            retake_user.last_name AS retake_requested_by_last_name,

            COALESCE((
              SELECT json_agg(json_build_object(
                'id', e.id,
                'file_name', e.file_name,
                'mime_type', e.mime_type,
                'file_size', e.file_size,
                'created_at', e.created_at
              ) ORDER BY e.created_at)
              FROM lead_pursuit_evidence e
              WHERE e.step_id=s.id
            ), '[]'::json) AS evidence,

            COALESCE((
              SELECT json_agg(json_build_object(
                'id', c.id,
                'body', c.body,
                'created_at', c.created_at,
                'updated_at', c.updated_at,
                'author_id', c.author_id,
                'author_first_name', cu.first_name,
                'author_last_name', cu.last_name
              ) ORDER BY c.created_at)
              FROM lead_pursuit_step_comments c
              LEFT JOIN users cu ON cu.id=c.author_id
              WHERE c.step_id=s.id
            ), '[]'::json) AS comments,

            COALESCE((
              SELECT json_agg(json_build_object(
                'id', submission.id,
                'submission_number', submission.submission_number,
                'notes', submission.notes,
                'submitted_at', submission.submitted_at,
                'submitted_by_id', submission.submitted_by_id,
                'submitted_by_first_name', su.first_name,
                'submitted_by_last_name', su.last_name,
                'evidence', COALESCE((
                  SELECT json_agg(json_build_object(
                    'id', se.id,
                    'evidence_id', se.evidence_id,
                    'file_name', se.file_name,
                    'mime_type', se.mime_type,
                    'file_size', se.file_size,
                    'created_at', se.created_at
                  ) ORDER BY se.created_at)
                  FROM lead_pursuit_submission_evidence se
                  WHERE se.submission_id=submission.id
                ), '[]'::json)
              ) ORDER BY submission.submission_number)
              FROM lead_pursuit_step_submissions submission
              LEFT JOIN users su ON su.id=submission.submitted_by_id
              WHERE submission.step_id=s.id
            ), '[]'::json) AS submissions,

            COALESCE((
              SELECT json_agg(json_build_object(
                'id', rel.id,
                'task_id', t.id,
                'title', t.title,
                'status', t.status,
                'priority', t.priority,
                'due_at', t.due_at,
                'completed_at', t.completed_at,
                'assigned_to_id', t.assigned_to_id,
                'assignee_first_name', au.first_name,
                'assignee_last_name', au.last_name,
                'blocks_completion', rel.blocks_completion
              ) ORDER BY rel.created_at DESC)
              FROM lead_pursuit_step_tasks rel
              JOIN tasks t ON t.id=rel.task_id
              LEFT JOIN users au ON au.id=t.assigned_to_id
              WHERE rel.step_id=s.id
            ), '[]'::json) AS tasks
          FROM lead_pursuit_instance_steps s
          LEFT JOIN users completed_user ON completed_user.id=s.completed_by_id
          LEFT JOIN users added_user ON added_user.id=s.added_by_id
          LEFT JOIN users retake_user ON retake_user.id=s.retake_requested_by_id
          WHERE s.instance_id=$1
          ORDER BY s.position
        `,
        [instance.id],
      )
    ).rows;

    const timeline = (
      await this.db.query(
        `
          SELECT * FROM (
            SELECT
              e.id,
              e.step_id,
              e.actor_user_id,
              e.event_type,
              e.message,
              e.metadata,
              e.created_at,
              u.first_name AS actor_first_name,
              u.last_name AS actor_last_name
            FROM lead_pursuit_timeline_events e
            LEFT JOIN users u ON u.id=e.actor_user_id
            WHERE e.instance_id=$1

            UNION ALL

            SELECT
              te.id,
              rel.step_id,
              te.actor_user_id,
              'TASK_' || te.event_type AS event_type,
              te.message,
              jsonb_build_object('task_id', te.task_id, 'new_values', te.new_values, 'old_values', te.old_values) AS metadata,
              te.created_at,
              u.first_name AS actor_first_name,
              u.last_name AS actor_last_name
            FROM task_events te
            JOIN lead_pursuit_step_tasks rel ON rel.task_id=te.task_id
            JOIN lead_pursuit_instance_steps pis ON pis.id=rel.step_id
            LEFT JOIN users u ON u.id=te.actor_user_id
            WHERE pis.instance_id=$1
          ) timeline
          ORDER BY created_at DESC
          LIMIT 250
        `,
        [instance.id],
      )
    ).rows;

    const currentStep = steps.find(
      (step: any) => !step.completed || step.review_status === 'RETAKE_REQUIRED',
    ) ?? null;

    const researchStep = steps.find((step: any) =>
      String(step.title).toLowerCase().includes('research'),
    );

    return {
      ...instance,
      current_step_id: currentStep?.id ?? null,
      current_step_position: currentStep?.position ?? null,
      current_step_title: currentStep?.title ?? null,
      steps,
      timeline,
      commercial_context: researchStep?.field_values ?? {},
      research_step_id: researchStep?.id ?? null,
    };
  }

  // ============================================================
  // STAFF DRAFTS / STAGE SUBMISSION
  // ============================================================

  async updateStep(
    leadId: string,
    stepId: string,
    body: any,
    ctx: Ctx,
  ) {
    const step = await this.requireStep(leadId, stepId);
    const fieldValues = body.fieldValues ?? step.field_values ?? {};
    const notes = this.clean(body.notes);

    if (!body.completed) {
      await this.saveDraft(leadId, step, fieldValues, notes, ctx);
      return this.getLeadPursuit(leadId);
    }

    return this.submitStep(leadId, stepId, {
      fieldValues,
      notes,
      comment: body.comment ?? body.comments ?? null,
    }, ctx);
  }

  async submitStep(
    leadId: string,
    stepId: string,
    body: { fieldValues?: Record<string, unknown>; notes?: string | null; comment?: string | null },
    ctx: Ctx,
  ) {
    const step = await this.requireStep(leadId, stepId);
    const fieldValues = body.fieldValues ?? step.field_values ?? {};

    await this.assertStageIsCurrent(step);
    await this.assertPreviousStepsCompleted(step.instance_id, step.position);
    this.validateFieldValues(step.form_fields ?? [], fieldValues);
    await this.validateContactFieldValues(leadId, step.form_fields ?? [], fieldValues);

    if (step.evidence_min_count > 0) {
      const evidenceCount = (
        await this.db.query(
          `
            SELECT count(*)::int AS count
            FROM lead_pursuit_evidence
            WHERE step_id=$1
              AND ($2::timestamptz IS NULL OR created_at>$2::timestamptz)
          `,
          [stepId, step.retake_requested_at ?? null],
        )
      ).rows[0].count;

      if (evidenceCount < step.evidence_min_count) {
        throw new BadRequestException(
          step.retake_requested_at
            ? `Upload at least ${step.evidence_min_count} new evidence file${step.evidence_min_count === 1 ? '' : 's'} after the retake request before submitting this stage`
            : `Upload at least ${step.evidence_min_count} evidence file${step.evidence_min_count === 1 ? '' : 's'} before submitting this stage`,
        );
      }
    }

    const taskGate = await this.taskGate(step.id, step.task_required, step.require_tasks_complete);
    if (!taskGate.ok) throw new BadRequestException(taskGate.message);

    const followUp = this.followUpValue(fieldValues);
    if (step.follow_up_required && !followUp) {
      throw new BadRequestException(
        'A next follow-up is required before this stage can be submitted',
      );
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `
          UPDATE lead_pursuit_instance_steps
          SET
            field_values=$2::jsonb,
            notes=$3,
            completed=true,
            completed_at=NOW(),
            completed_by_id=$4::uuid,
            review_status='SUBMITTED',
            retake_reason=NULL,
            retake_requested_at=NULL,
            retake_requested_by_id=NULL,
            updated_at=NOW()
          WHERE id=$1
        `,
        [
          stepId,
          JSON.stringify(fieldValues),
          this.clean(body.notes),
          ctx.actorUserId ?? null,
        ],
      );

      if (followUp) {
        await client.query(
          `UPDATE leads SET next_follow_up_at=$2::timestamptz, updated_at=NOW() WHERE id=$1`,
          [leadId, followUp],
        );
      }

      const submissionNumber = (
        await client.query(
          `SELECT COALESCE(MAX(submission_number),0)+1 AS n FROM lead_pursuit_step_submissions WHERE step_id=$1`,
          [stepId],
        )
      ).rows[0].n;

      const submission = (
        await client.query(
          `
            INSERT INTO lead_pursuit_step_submissions(step_id,submitted_by_id,notes,submission_number)
            VALUES($1,$2,$3,$4)
            RETURNING *
          `,
          [stepId, ctx.actorUserId ?? null, this.clean(body.notes), submissionNumber],
        )
      ).rows[0];

      await client.query(
        `
          INSERT INTO lead_pursuit_submission_evidence(
            submission_id,evidence_id,file_name,storage_path,mime_type,file_size
          )
          SELECT $1,e.id,e.file_name,e.storage_path,e.mime_type,e.file_size
          FROM lead_pursuit_evidence e
          WHERE e.step_id=$2
        `,
        [submission.id, stepId],
      );

      await client.query(
        `
          INSERT INTO lead_pursuit_timeline_events(instance_id,step_id,actor_user_id,event_type,message,metadata)
          VALUES($1,$2,$3,'STAGE_SUBMITTED',$4,$5::jsonb)
        `,
        [
          step.instance_id,
          stepId,
          ctx.actorUserId ?? null,
          `${step.title} submitted`,
          JSON.stringify({ fieldKeys: Object.keys(fieldValues), submissionNumber }),
        ],
      );

      if (body.comment && step.comments_enabled) {
        await client.query(
          `INSERT INTO lead_pursuit_step_comments(step_id,author_id,body) VALUES($1,$2,$3)`,
          [stepId, ctx.actorUserId ?? null, this.clean(body.comment)],
        );
        await client.query(
          `
            INSERT INTO lead_pursuit_timeline_events(instance_id,step_id,actor_user_id,event_type,message,metadata)
            VALUES($1,$2,$3,'COMMENT_ADDED','Stage comment added',$4::jsonb)
          `,
          [step.instance_id, stepId, ctx.actorUserId ?? null, JSON.stringify({ source: 'submission' })],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await this.syncLeadStageFromPursuit(leadId, step.title);
    await this.recalc(leadId, step.instance_id);
    const nextStep = (await this.db.query(`SELECT id,title FROM lead_pursuit_instance_steps WHERE instance_id=$1 AND position>$2 ORDER BY position LIMIT 1`, [step.instance_id, step.position])).rows[0];
    if (nextStep) {
      await this.timeline(step.instance_id, nextStep.id, ctx.actorUserId, 'STAGE_UNLOCKED', `${nextStep.title} is now available`, { previousStepId: step.id });
    }

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_STAGE_SUBMITTED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: {
        leadId,
        title: step.title,
        fieldValues,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getLeadPursuit(leadId);
  }

  private async saveDraft(
    leadId: string,
    step: any,
    fieldValues: Record<string, unknown>,
    notes: string | null,
    ctx: Ctx,
  ) {
    this.validateFieldValues(step.form_fields ?? [], fieldValues, false);
    await this.db.query(
      `
        UPDATE lead_pursuit_instance_steps
        SET field_values=$2::jsonb,notes=$3,updated_at=NOW()
        WHERE id=$1
      `,
      [step.id, JSON.stringify(fieldValues), notes],
    );

    await this.timeline(step.instance_id, step.id, ctx.actorUserId, 'STAGE_DRAFT_SAVED', `${step.title} draft saved`, {
      fieldKeys: Object.keys(fieldValues),
    });
  }

  // ============================================================
  // EVIDENCE
  // ============================================================

  async evidence(
    leadId: string,
    stepId: string,
    file: File | undefined,
    ctx: Ctx,
  ) {
    if (!file) throw new BadRequestException('Evidence file is required');
    if (!allowed.has(file.mimetype) || file.size > 10 * 1024 * 1024) {
      throw new BadRequestException(
        'Unsupported evidence file or file is larger than 10 MB',
      );
    }

    const step = await this.requireStep(leadId, stepId);
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `lead-evidence/${leadId}/${stepId}/${randomUUID()}-${safe}`;

    const upload = await this.supabase.admin.storage.from(bucket).upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (upload.error) throw new BadRequestException('Evidence upload failed. Please try again.');

    const evidence = (
      await this.db.query(
        `
          INSERT INTO lead_pursuit_evidence(step_id,uploaded_by_id,file_name,storage_path,mime_type,file_size)
          VALUES($1,$2,$3,$4,$5,$6)
          RETURNING *
        `,
        [stepId, ctx.actorUserId ?? null, file.originalname, path, file.mimetype, file.size],
      )
    ).rows[0];

    await this.timeline(step.instance_id, stepId, ctx.actorUserId, 'EVIDENCE_UPLOADED', `Evidence uploaded: ${file.originalname}`, {
      evidenceId: evidence.id,
      fileName: file.originalname,
    });

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_EVIDENCE_UPLOADED',
      module: 'leads',
      entityType: 'lead_pursuit_evidence',
      entityId: evidence.id,
      newValues: { leadId, stepId, fileName: file.originalname },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return evidence;
  }

  async downloadEvidence(leadId: string, stepId: string, evidenceId: string) {
    const evidence = (
      await this.db.query(
        `
          SELECT e.*
          FROM lead_pursuit_evidence e
          JOIN lead_pursuit_instance_steps s ON s.id=e.step_id
          JOIN lead_pursuit_instances i ON i.id=s.instance_id
          WHERE e.id=$1 AND e.step_id=$2 AND i.lead_id=$3
        `,
        [evidenceId, stepId, leadId],
      )
    ).rows[0];

    if (!evidence) throw new NotFoundException('Evidence not found');

    const signed = await this.supabase.admin.storage.from(bucket).createSignedUrl(
      evidence.storage_path,
      60 * 5,
      { download: evidence.file_name },
    );

    if (signed.error || !signed.data?.signedUrl) {
      throw new BadRequestException('Unable to open evidence file');
    }

    return { id: evidence.id, fileName: evidence.file_name, signedUrl: signed.data.signedUrl };
  }

  // ============================================================
  // COMMENTS / REVIEW
  // ============================================================

  async comment(leadId: string, stepId: string, body: any, ctx: Ctx) {
    const step = await this.requireStep(leadId, stepId);
    if (!step.comments_enabled) {
      throw new BadRequestException('Comments are disabled for this stage');
    }

    const comment = this.clean(body.body);
    if (!comment) throw new BadRequestException('Comment is required');

    const row = (
      await this.db.query(
        `INSERT INTO lead_pursuit_step_comments(step_id,author_id,body) VALUES($1,$2,$3) RETURNING *`,
        [stepId, ctx.actorUserId ?? null, comment],
      )
    ).rows[0];

    await this.timeline(step.instance_id, stepId, ctx.actorUserId, 'COMMENT_ADDED', 'Stage comment added', {
      commentId: row.id,
    });

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_COMMENT_ADDED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: { leadId, comment },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  }

  async markReviewed(leadId: string, stepId: string, ctx: Ctx) {
    const step = await this.requireStep(leadId, stepId);
    if (!step.completed) {
      throw new BadRequestException('Only a completed pursuit stage can be marked reviewed');
    }

    await this.db.query(
      `UPDATE lead_pursuit_instance_steps SET review_status='APPROVED',updated_at=NOW() WHERE id=$1`,
      [stepId],
    );
    await this.timeline(step.instance_id, stepId, ctx.actorUserId, 'STAGE_REVIEWED', `${step.title} reviewed`, {});

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_STEP_REVIEWED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: { leadId, title: step.title },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getLeadPursuit(leadId);
  }

  async requestRetake(leadId: string, stepId: string, body: any, ctx: Ctx) {
    const step = await this.requireStep(leadId, stepId);
    if (!step.completed) {
      throw new BadRequestException('Only a completed pursuit stage can be sent back for retake');
    }

    const reason = this.clean(body.reason);
    if (!reason) throw new BadRequestException('A reason is required when requesting a retake');

    await this.db.query(
      `
        UPDATE lead_pursuit_instance_steps
        SET completed=false,completed_at=NULL,completed_by_id=NULL,
            review_status='RETAKE_REQUIRED',retake_reason=$2,
            retake_requested_at=NOW(),retake_requested_by_id=$3::uuid,updated_at=NOW()
        WHERE id=$1
      `,
      [stepId, reason, ctx.actorUserId ?? null],
    );

    await this.recalc(leadId, step.instance_id);
    await this.timeline(step.instance_id, stepId, ctx.actorUserId, 'RETAKE_REQUESTED', `${step.title} sent back for retake`, { reason });

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_RETAKE_REQUESTED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: { leadId, title: step.title, reason },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getLeadPursuit(leadId);
  }

  // ============================================================
  // STAGE TASKS
  // ============================================================

  async createStageTask(leadId: string, stepId: string, body: any, ctx: Ctx) {
    const step = await this.requireStep(leadId, stepId);
    const lead = (
      await this.db.query(
        `SELECT id,organization_id,assigned_to_id,title FROM leads WHERE id=$1`,
        [leadId],
      )
    ).rows[0];
    if (!lead) throw new NotFoundException('Lead not found');

    const title = this.clean(body.title);
    if (!title) throw new BadRequestException('Task title is required');
    const assignedToId = this.clean(body.assignedToId) ?? lead.assigned_to_id ?? null;
    if (!assignedToId) throw new BadRequestException('Assign the task to a staff member');

    const staff = (
      await this.db.query(
        `SELECT id FROM users WHERE id=$1 AND status='ACTIVE'`,
        [assignedToId],
      )
    ).rows[0];
    if (!staff) throw new BadRequestException('The selected staff member is not active');

    const task = await this.tasks.create(
      {
        title,
        description: this.clean(body.description) ?? `Task for Pursuit stage: ${step.title}`,
        organizationId: lead.organization_id,
        leadId,
        assignedToId,
        assignmentType: 'STAFF',
        status: 'TODO',
        priority: body.priority ?? 'MEDIUM',
        dueAt: this.clean(body.dueAt),
      },
      ctx,
    );

    await this.db.query(
      `
        INSERT INTO lead_pursuit_step_tasks(step_id,task_id,blocks_completion,created_by_id)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(step_id,task_id) DO UPDATE SET blocks_completion=EXCLUDED.blocks_completion
      `,
      [stepId, task.id, Boolean(body.blocksCompletion), ctx.actorUserId ?? null],
    );

    await this.timeline(step.instance_id, stepId, ctx.actorUserId, 'TASK_LINKED', `Task linked to ${step.title}: ${title}`, {
      taskId: task.id,
      blocksCompletion: Boolean(body.blocksCompletion),
    });

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_STAGE_TASK_CREATED',
      module: 'leads',
      entityType: 'task',
      entityId: task.id,
      newValues: { leadId, stepId, title, assignedToId, blocksCompletion: Boolean(body.blocksCompletion) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getLeadPursuit(leadId);
  }

  // ============================================================
  // CUSTOM PURSUIT STEPS — retained for backward compatibility
  // ============================================================

  async addCustomStep(
    leadId: string,
    body: any,
    origin: CustomStepOrigin,
    ctx: Ctx,
  ) {
    const title = this.clean(body.title);
    if (!title) throw new BadRequestException('Custom pursuit step title is required');

    const instance = await this.instanceForLead(leadId);
    let afterPosition = 0;
    if (body.afterStepId) {
      const afterStep = (
        await this.db.query(
          `SELECT position FROM lead_pursuit_instance_steps WHERE id=$1 AND instance_id=$2`,
          [body.afterStepId, instance.id],
        )
      ).rows[0];
      if (!afterStep) throw new BadRequestException('The selected insertion stage does not belong to this pursuit');
      afterPosition = afterStep.position;
    } else {
      afterPosition = (
        await this.db.query(
          `SELECT COALESCE(MAX(position),0)::int AS position FROM lead_pursuit_instance_steps WHERE instance_id=$1`,
          [instance.id],
        )
      ).rows[0].position;
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE lead_pursuit_instance_steps SET position=position+100000 WHERE instance_id=$1 AND position>$2`,
        [instance.id, afterPosition],
      );
      await client.query(
        `UPDATE lead_pursuit_instance_steps SET position=position-99999 WHERE instance_id=$1 AND position>100000`,
        [instance.id],
      );
      const inserted = (
        await client.query(
          `
            INSERT INTO lead_pursuit_instance_steps(
              instance_id,title,description,position,evidence_required,step_origin,added_by_id,review_status,
              guidance,form_fields,field_values,comments_enabled,evidence_min_count,task_required,require_tasks_complete,follow_up_required,transition_requirements
            )
            VALUES($1,$2,$3,$4,true,$5,$6,'PENDING',$7,'[]'::jsonb,'{}'::jsonb,true,1,false,false,false,'{}'::jsonb)
            RETURNING id
          `,
          [instance.id, title, this.clean(body.description), afterPosition + 1, origin, ctx.actorUserId ?? null, 'Complete this required stage and attach supporting evidence.'],
        )
      ).rows[0];
      await client.query('COMMIT');

      await this.recalc(leadId, instance.id);
      await this.timeline(instance.id, inserted.id, ctx.actorUserId, 'STAGE_ADDED', `${title} added to pursuit`, { origin });
      return this.getLeadPursuit(leadId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStaffCustomStep(leadId: string, stepId: string, body: any, ctx: Ctx) {
    const step = await this.requireStep(leadId, stepId);
    if (step.step_origin !== 'STAFF_CUSTOM') {
      throw new BadRequestException('Only staff-created custom pursuit stages can be edited here');
    }
    if (step.added_by_id && ctx.actorUserId && step.added_by_id !== ctx.actorUserId) {
      throw new BadRequestException('You can only edit custom stages that you created');
    }
    if (step.completed) throw new BadRequestException('Completed custom stages cannot be edited');
    const title = this.clean(body.title);
    if (!title) throw new BadRequestException('Stage title is required');

    await this.db.query(
      `UPDATE lead_pursuit_instance_steps SET title=$2,description=$3,updated_at=NOW() WHERE id=$1`,
      [stepId, title, this.clean(body.description)],
    );
    await this.timeline(step.instance_id, stepId, ctx.actorUserId, 'STAGE_UPDATED', `${title} updated`, {});
    return this.getLeadPursuit(leadId);
  }

  async deleteStaffCustomStep(leadId: string, stepId: string, ctx: Ctx) {
    const step = await this.requireStep(leadId, stepId);
    if (step.step_origin !== 'STAFF_CUSTOM') {
      throw new BadRequestException('Workflow and Admin-required stages cannot be deleted by staff');
    }
    if (step.added_by_id && ctx.actorUserId && step.added_by_id !== ctx.actorUserId) {
      throw new BadRequestException('You can only delete custom stages that you created');
    }
    if (step.completed) throw new BadRequestException('Completed custom stages cannot be deleted');

    await this.db.query(`DELETE FROM lead_pursuit_instance_steps WHERE id=$1`, [stepId]);
    const rows = (
      await this.db.query(
        `SELECT id FROM lead_pursuit_instance_steps WHERE instance_id=$1 ORDER BY position`,
        [step.instance_id],
      )
    ).rows;
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE lead_pursuit_instance_steps SET position=position+100000 WHERE instance_id=$1`, [step.instance_id]);
      for (let index = 0; index < rows.length; index += 1) {
        await client.query(`UPDATE lead_pursuit_instance_steps SET position=$2 WHERE id=$1`, [rows[index].id, index + 1]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.recalc(leadId, step.instance_id);
    return this.getLeadPursuit(leadId);
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  private async insertWorkflowSteps(client: any, workflowId: string, steps: any[]) {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      await client.query(
        `
          INSERT INTO lead_pursuit_workflow_steps(
            workflow_id,title,description,position,evidence_required,guidance,form_fields,
            comments_enabled,evidence_min_count,task_required,require_tasks_complete,follow_up_required,transition_requirements
          )
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13::jsonb)
        `,
        [
          workflowId,
          step.title,
          step.description,
          index + 1,
          step.evidenceMinCount > 0,
          step.guidance,
          JSON.stringify(step.formFields),
          step.commentsEnabled,
          step.evidenceMinCount,
          step.taskRequired,
          step.requireTasksComplete,
          step.followUpRequired,
          JSON.stringify(step.transitionRequirements),
        ],
      );
    }
  }

  private normalizeWorkflowSteps(input: any): any[] {
    if (!Array.isArray(input)) return [];

    return input.map((raw: any, index: number) => {
      const title = this.clean(raw?.title);
      if (!title) throw new BadRequestException(`Stage ${index + 1} needs a title`);

      const rawFields = Array.isArray(raw.formFields)
        ? raw.formFields
        : Array.isArray(raw.fields)
          ? raw.fields
          : [];

      const formFields: PursuitField[] = [];
      const seenKeys = new Set<string>();
      for (let fieldIndex = 0; fieldIndex < rawFields.length; fieldIndex += 1) {
        const field = rawFields[fieldIndex] ?? {};
        const label = this.clean(field.label);
        if (!label) throw new BadRequestException(`${title}: field ${fieldIndex + 1} needs a label`);
        const type = String(field.type ?? 'text') as FieldType;
        if (!fieldTypes.has(type)) throw new BadRequestException(`${title}: ${label} has an unsupported field type`);
        const key = this.slug(this.clean(field.key) || label) || `field_${fieldIndex + 1}`;
        if (seenKeys.has(key)) throw new BadRequestException(`${title}: duplicate field key "${key}"`);
        seenKeys.add(key);

        const options = Array.isArray(field.options)
          ? field.options.map((option: unknown) => String(option).trim()).filter(Boolean)
          : undefined;
        if ((type === 'select' || type === 'multiselect') && (!options || !options.length)) {
          throw new BadRequestException(`${title}: ${label} needs at least one option`);
        }

        formFields.push({
          key,
          label,
          type,
          required: Boolean(field.required),
          placeholder: this.clean(field.placeholder),
          helpText: this.clean(field.helpText ?? field.help_text),
          options,
          min: field.min === null || field.min === undefined || field.min === '' ? null : Number(field.min),
          max: field.max === null || field.max === undefined || field.max === '' ? null : Number(field.max),
        });
      }

      const evidenceMinCount = Math.max(
        0,
        Number(raw.evidenceMinCount ?? (raw.evidenceRequired ? 1 : 0)) || 0,
      );

      return {
        title,
        description: this.clean(raw.description),
        guidance: this.clean(raw.guidance ?? raw.instructions),
        formFields,
        commentsEnabled: raw.commentsEnabled !== false,
        evidenceMinCount,
        taskRequired: Boolean(raw.taskRequired),
        requireTasksComplete: Boolean(raw.requireTasksComplete),
        followUpRequired: Boolean(raw.followUpRequired),
        transitionRequirements: raw.transitionRequirements && typeof raw.transitionRequirements === 'object'
          ? raw.transitionRequirements
          : {},
      };
    });
  }

  private validateFieldValues(fields: any[], values: Record<string, unknown>, enforceRequired = true) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new BadRequestException('Stage responses must be an object');
    }

    for (const field of fields ?? []) {
      const value = values[field.key];
      const missing = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (enforceRequired && field.required && missing) {
        throw new BadRequestException(`"${field.label}" is required before this stage can be submitted`);
      }
      if (missing) continue;

      if (field.type === 'number' || field.type === 'currency') {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) throw new BadRequestException(`"${field.label}" must be a valid number`);
        if (field.min !== null && field.min !== undefined && numberValue < Number(field.min)) throw new BadRequestException(`"${field.label}" is below the minimum allowed value`);
        if (field.max !== null && field.max !== undefined && numberValue > Number(field.max)) throw new BadRequestException(`"${field.label}" is above the maximum allowed value`);
      }

      if (field.type === 'select' && !field.options?.includes(String(value))) {
        throw new BadRequestException(`"${field.label}" has an invalid selection`);
      }

      if (field.type === 'multiselect') {
        if (!Array.isArray(value) || value.some((item) => !field.options?.includes(String(item)))) {
          throw new BadRequestException(`"${field.label}" has an invalid selection`);
        }
      }

      if (field.type === 'checkbox' && typeof value !== 'boolean') {
        throw new BadRequestException(`"${field.label}" must be true or false`);
      }

      if (field.type === 'url' && !/^https?:\/\//i.test(String(value))) {
        throw new BadRequestException(`"${field.label}" must be a valid URL`);
      }

      if (field.type === 'email' && !/^\S+@\S+\.\S+$/.test(String(value))) {
        throw new BadRequestException(`"${field.label}" must be a valid email address`);
      }

      if (field.type === 'contact' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value))) {
        throw new BadRequestException(`"${field.label}" must reference a valid contact`);
      }
    }
  }

  private async validateContactFieldValues(leadId: string, fields: any[], values: Record<string, unknown>) {
    const ids = (fields ?? [])
      .filter((field: any) => field.type === 'contact' && values[field.key])
      .map((field: any) => String(values[field.key]));
    if (!ids.length) return;

    const result = await this.db.query(
      `
        SELECT c.id
        FROM contacts c
        JOIN leads l ON l.organization_id=c.organization_id
        WHERE l.id=$1 AND c.id=ANY($2::uuid[])
      `,
      [leadId, ids],
    );
    if (result.rows.length !== ids.length) {
      throw new BadRequestException('One or more selected contacts do not belong to this Lead organisation');
    }
  }

  private async taskGate(stepId: string, taskRequired: boolean, requireTasksComplete: boolean) {
    const rows = (
      await this.db.query(
        `
          SELECT t.id,t.status,rel.blocks_completion
          FROM lead_pursuit_step_tasks rel
          JOIN tasks t ON t.id=rel.task_id
          WHERE rel.step_id=$1
        `,
        [stepId],
      )
    ).rows;

    if (taskRequired && rows.length === 0) {
      return { ok: false, message: 'At least one task must be created for this stage before it can be submitted' };
    }

    if (requireTasksComplete) {
      const incomplete = rows.find((row: any) => row.blocks_completion && row.status !== 'COMPLETED');
      if (incomplete) return { ok: false, message: 'All blocking tasks for this stage must be completed before submission' };
    }

    return { ok: true, message: '' };
  }

  private followUpValue(values: Record<string, unknown>) {
    const candidate = values.next_follow_up_at ?? values.nextFollowUpAt ?? null;
    if (!candidate) return null;
    const parsed = new Date(String(candidate));
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Next follow-up must be a valid date and time');
    return parsed.toISOString();
  }

  private async syncLeadStageFromPursuit(leadId: string, title: string) {
    const normalized = title.toLowerCase();
    const nextStage = normalized.includes('research')
      ? 'RESEARCHING'
      : normalized === 'contacted'
        ? 'CONTACTED'
        : normalized === 'engaged'
          ? 'ENGAGED'
          : normalized.includes('qualified') || normalized.includes('conversion')
            ? 'QUALIFIED'
            : 'ENGAGED';

    await this.db.query(
      `
        UPDATE leads
        SET stage=$2::lead_stage,updated_at=NOW()
        WHERE id=$1
          AND record_type='LEAD'::lead_record_type
          AND stage NOT IN ('READY_FOR_PROSPECT_REVIEW','DISQUALIFIED','UNQUALIFIED')
      `,
      [leadId, nextStage],
    );
  }

  private async requireStep(leadId: string, stepId: string) {
    const step = (
      await this.db.query(
        `
          SELECT s.*
          FROM lead_pursuit_instance_steps s
          JOIN lead_pursuit_instances i ON i.id=s.instance_id
          WHERE s.id=$1 AND i.lead_id=$2
        `,
        [stepId, leadId],
      )
    ).rows[0];
    if (!step) throw new NotFoundException('Pursuit stage not found');
    return step;
  }

  private async instanceForLead(leadId: string) {
    const instance = (
      await this.db.query(
        `SELECT * FROM lead_pursuit_instances WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [leadId],
      )
    ).rows[0];
    if (!instance) throw new NotFoundException('Lead pursuit instance not found');
    return instance;
  }

  private async assertStageIsCurrent(step: any) {
    if (step.completed && step.review_status !== 'RETAKE_REQUIRED') {
      throw new BadRequestException(`"${step.title}" has already been submitted. Ask Admin for a retake if changes are required.`);
    }

    const current = (
      await this.db.query(
        `
          SELECT id,title
          FROM lead_pursuit_instance_steps
          WHERE instance_id=$1 AND completed=false
          ORDER BY position
          LIMIT 1
        `,
        [step.instance_id],
      )
    ).rows[0];

    if (!current || current.id !== step.id) {
      throw new BadRequestException(
        current ? `Complete "${current.title}" before working on this stage` : 'This pursuit has no active stage',
      );
    }
  }

  private async assertPreviousStepsCompleted(instanceId: string, position: number) {
    const previousIncomplete = (
      await this.db.query(
        `
          SELECT id,title
          FROM lead_pursuit_instance_steps
          WHERE instance_id=$1 AND position<$2 AND completed=false
          ORDER BY position
          LIMIT 1
        `,
        [instanceId, position],
      )
    ).rows[0];
    if (previousIncomplete) throw new BadRequestException(`Complete "${previousIncomplete.title}" before continuing`);
  }

  private async recalc(leadId: string, instanceId: string) {
    const counts = (
      await this.db.query(
        `SELECT count(*)::int AS total,count(*) FILTER (WHERE completed)::int AS done FROM lead_pursuit_instance_steps WHERE instance_id=$1`,
        [instanceId],
      )
    ).rows[0];
    const progress = counts.total ? Math.round((counts.done * 100) / counts.total) : 0;
    await this.db.query(`UPDATE leads SET pursuit_progress=$2,updated_at=NOW() WHERE id=$1`, [leadId, progress]);
  }

  private async timeline(
    instanceId: string,
    stepId: string | null,
    actorUserId: string | undefined,
    eventType: string,
    message: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.query(
      `
        INSERT INTO lead_pursuit_timeline_events(instance_id,step_id,actor_user_id,event_type,message,metadata)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)
      `,
      [instanceId, stepId, actorUserId ?? null, eventType, message, JSON.stringify(metadata)],
    );
  }

  private clean(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const result = String(value).trim();
    return result || null;
  }

  private slug(value: string | null) {
    return value
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) ?? '';
  }
}
