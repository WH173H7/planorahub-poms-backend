import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';

type Ctx = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type Step = {
  title: string;
  description?: string | null;
  evidenceRequired?: boolean;
};

type File = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type CustomStepOrigin = 'STAFF_CUSTOM' | 'ADMIN_REQUIRED';

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

@Injectable()
export class PursuitWorkflowsService {
  constructor(
    private db: DatabaseService,
    private audit: AuditService,
    private supabase: SupabaseService,
  ) {}

  // ============================================================
  // WORKFLOW TEMPLATES
  // ============================================================

  async list() {
    return (
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
                'evidence_required', s.evidence_required
              )
              ORDER BY s.position
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'
          ) steps
        FROM lead_pursuit_workflows w
        LEFT JOIN lead_pursuit_workflow_steps s
          ON s.workflow_id = w.id
        WHERE w.is_active = true
        GROUP BY w.id
        ORDER BY w.is_default DESC, w.name
      `)
    ).rows;
  }

  async create(body: any, ctx: Ctx) {
    const name = body.name?.trim();
    const steps = (body.steps ?? []) as Step[];

    if (!name || !steps.length) {
      throw new BadRequestException(
        'Workflow name and at least one step are required',
      );
    }

    const c = await this.db.getClient();

    try {
      await c.query('BEGIN');

      const workflow = (
        await c.query(
          `
            INSERT INTO lead_pursuit_workflows(
              name,
              description,
              created_by_id
            )
            VALUES($1, $2, $3)
            RETURNING *
          `,
          [
            name,
            body.description?.trim() || null,
            ctx.actorUserId ?? null,
          ],
        )
      ).rows[0];

      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];

        if (!step.title?.trim()) {
          throw new BadRequestException(
            'Every workflow step needs a title',
          );
        }

        await c.query(
          `
            INSERT INTO lead_pursuit_workflow_steps(
              workflow_id,
              title,
              description,
              position,
              evidence_required
            )
            VALUES($1, $2, $3, $4, true)
          `,
          [
            workflow.id,
            step.title.trim(),
            step.description?.trim() || null,
            i + 1,
          ],
        );
      }

      await c.query('COMMIT');

      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action: 'PURSUIT_WORKFLOW_CREATED',
        module: 'leads',
        entityType: 'lead_pursuit_workflow',
        entityId: workflow.id,
        newValues: {
          name,
          steps: steps.map((step) => ({
            ...step,
            evidenceRequired: true,
          })),
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return workflow;
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  async update(id: string, body: any, ctx: Ctx) {
    const current = (
      await this.db.query(
        `
          SELECT *
          FROM lead_pursuit_workflows
          WHERE id = $1
            AND is_active = true
        `,
        [id],
      )
    ).rows[0];

    if (!current) {
      throw new NotFoundException('Workflow not found');
    }

    const name = body.name?.trim();
    const steps = (body.steps ?? []) as Step[];

    if (!name || !steps.length) {
      throw new BadRequestException(
        'Workflow name and at least one step are required',
      );
    }

    const c = await this.db.getClient();

    try {
      await c.query('BEGIN');

      const updated = (
        await c.query(
          `
            UPDATE lead_pursuit_workflows
            SET
              name = $2,
              description = $3,
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [id, name, body.description?.trim() || null],
        )
      ).rows[0];

      await c.query(
        `
          DELETE FROM lead_pursuit_workflow_steps
          WHERE workflow_id = $1
        `,
        [id],
      );

      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];

        if (!step.title?.trim()) {
          throw new BadRequestException(
            'Every workflow step needs a title',
          );
        }

        await c.query(
          `
            INSERT INTO lead_pursuit_workflow_steps(
              workflow_id,
              title,
              description,
              position,
              evidence_required
            )
            VALUES($1, $2, $3, $4, true)
          `,
          [
            id,
            step.title.trim(),
            step.description?.trim() || null,
            i + 1,
          ],
        );
      }

      await c.query('COMMIT');

      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action: 'PURSUIT_WORKFLOW_UPDATED',
        module: 'leads',
        entityType: 'lead_pursuit_workflow',
        entityId: id,
        oldValues: current,
        newValues: {
          name,
          description: body.description?.trim() || null,
          steps: steps.map((step) => ({
            ...step,
            evidenceRequired: true,
          })),
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return updated;
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  async setDefault(id: string, ctx: Ctx) {
    const workflow = (
      await this.db.query(
        `
          SELECT *
          FROM lead_pursuit_workflows
          WHERE id = $1
            AND is_active = true
        `,
        [id],
      )
    ).rows[0];

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const c = await this.db.getClient();

    try {
      await c.query('BEGIN');

      await c.query(`
        UPDATE lead_pursuit_workflows
        SET
          is_default = false,
          updated_at = NOW()
        WHERE is_default = true
      `);

      const updated = (
        await c.query(
          `
            UPDATE lead_pursuit_workflows
            SET
              is_default = true,
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [id],
        )
      ).rows[0];

      await c.query('COMMIT');

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
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  async remove(id: string, ctx: Ctx) {
    const workflow = (
      await this.db.query(
        `
          SELECT *
          FROM lead_pursuit_workflows
          WHERE id = $1
        `,
        [id],
      )
    ).rows[0];

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.is_default) {
      throw new BadRequestException(
        'Choose another default workflow before archiving this workflow.',
      );
    }

    await this.db.query(
      `
        UPDATE lead_pursuit_workflows
        SET
          is_active = false,
          is_default = false,
          updated_at = NOW()
        WHERE id = $1
      `,
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
          SELECT *
          FROM lead_pursuit_instances
          WHERE lead_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [leadId],
      )
    ).rows[0];

    if (!instance) {
      return null;
    }

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

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', e.id,
                    'file_name', e.file_name,
                    'mime_type', e.mime_type,
                    'file_size', e.file_size,
                    'created_at', e.created_at
                  )
                  ORDER BY e.created_at
                )
                FROM lead_pursuit_evidence e
                WHERE e.step_id = s.id
              ),
              '[]'::json
            ) AS evidence,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', c.id,
                    'body', c.body,
                    'created_at', c.created_at,
                    'updated_at', c.updated_at,
                    'author_id', c.author_id,
                    'author_first_name', cu.first_name,
                    'author_last_name', cu.last_name
                  )
                  ORDER BY c.created_at
                )
                FROM lead_pursuit_step_comments c
                LEFT JOIN users cu
                  ON cu.id = c.author_id
                WHERE c.step_id = s.id
              ),
              '[]'::json
            ) AS comments,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', submission.id,
                    'submission_number', submission.submission_number,
                    'notes', submission.notes,
                    'submitted_at', submission.submitted_at,
                    'submitted_by_id', submission.submitted_by_id,
                    'submitted_by_first_name', su.first_name,
                    'submitted_by_last_name', su.last_name,
                    'evidence',
                      COALESCE(
                        (
                          SELECT json_agg(
                            json_build_object(
                              'id', se.id,
                              'evidence_id', se.evidence_id,
                              'file_name', se.file_name,
                              'mime_type', se.mime_type,
                              'file_size', se.file_size,
                              'created_at', se.created_at
                            )
                            ORDER BY se.created_at
                          )
                          FROM lead_pursuit_submission_evidence se
                          WHERE se.submission_id = submission.id
                        ),
                        '[]'::json
                      )
                  )
                  ORDER BY submission.submission_number
                )
                FROM lead_pursuit_step_submissions submission
                LEFT JOIN users su
                  ON su.id = submission.submitted_by_id
                WHERE submission.step_id = s.id
              ),
              '[]'::json
            ) AS submissions

          FROM lead_pursuit_instance_steps s

          LEFT JOIN users completed_user
            ON completed_user.id = s.completed_by_id

          LEFT JOIN users added_user
            ON added_user.id = s.added_by_id

          LEFT JOIN users retake_user
            ON retake_user.id = s.retake_requested_by_id

          WHERE s.instance_id = $1

          ORDER BY s.position
        `,
        [instance.id],
      )
    ).rows;

    return {
      ...instance,
      steps,
    };
  }

  // ============================================================
  // STAFF STEP SUBMISSION / COMPLETION
  // ============================================================

  async updateStep(
    leadId: string,
    stepId: string,
    body: any,
    ctx: Ctx,
  ) {
    const step = await this.requireStep(leadId, stepId);

    const completed = !!body.completed;

    if (completed) {
      await this.assertPreviousStepsCompleted(
        step.instance_id,
        step.position,
      );

      const evidenceCount = (
        await this.db.query(
          `
            SELECT count(*)::int AS count
            FROM lead_pursuit_evidence
            WHERE step_id = $1
              AND (
                $2::timestamptz IS NULL
                OR created_at > $2::timestamptz
              )
          `,
          [stepId, step.retake_requested_at ?? null],
        )
      ).rows[0].count;

      if (!evidenceCount) {
        throw new BadRequestException(
          step.retake_requested_at
            ? 'New evidence is required after the retake request before this step can be completed'
            : 'Evidence is required before this step can be completed',
        );
      }

      const notes = body.notes?.trim() || null;

      const client = await this.db.getClient();

      try {
        await client.query('BEGIN');

        await client.query(
          `
            UPDATE lead_pursuit_instance_steps
            SET
              completed = true,
              completed_at = NOW(),
              completed_by_id = $2::uuid,
              notes = $3,
              review_status = 'SUBMITTED',
              retake_reason = NULL,
              retake_requested_at = NULL,
              retake_requested_by_id = NULL,
              updated_at = NOW()
            WHERE id = $1
          `,
          [
            stepId,
            ctx.actorUserId ?? null,
            notes,
          ],
        );

        const nextSubmission = (
          await client.query(
            `
              SELECT COALESCE(MAX(submission_number), 0) + 1 AS n
              FROM lead_pursuit_step_submissions
              WHERE step_id = $1
            `,
            [stepId],
          )
        ).rows[0].n;

        const submission = (
          await client.query(
            `
              INSERT INTO lead_pursuit_step_submissions(
                step_id,
                submitted_by_id,
                notes,
                submission_number
              )
              VALUES($1, $2, $3, $4)
              RETURNING *
            `,
            [
              stepId,
              ctx.actorUserId ?? null,
              notes,
              nextSubmission,
            ],
          )
        ).rows[0];

        await client.query(
          `
            INSERT INTO lead_pursuit_submission_evidence(
              submission_id,
              evidence_id,
              file_name,
              storage_path,
              mime_type,
              file_size
            )
            SELECT
              $1,
              e.id,
              e.file_name,
              e.storage_path,
              e.mime_type,
              e.file_size
            FROM lead_pursuit_evidence e
            WHERE e.step_id = $2
          `,
          [submission.id, stepId],
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      await this.recalc(leadId, step.instance_id);

      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action: 'LEAD_PURSUIT_STEP_COMPLETED',
        module: 'leads',
        entityType: 'lead_pursuit_step',
        entityId: stepId,
        newValues: {
          leadId,
          title: step.title,
          completed: true,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return this.getLeadPursuit(leadId);
    }

    // Preserve retake supervision metadata while staff updates notes on an
    // already-incomplete retake. Normal manual reopen remains compatible.
    await this.db.query(
      `
        UPDATE lead_pursuit_instance_steps
        SET
          completed = false,
          completed_at = NULL,
          completed_by_id = NULL,
          notes = $2,
          review_status = CASE
            WHEN review_status = 'RETAKE_REQUIRED' AND completed = false
              THEN 'RETAKE_REQUIRED'
            ELSE 'PENDING'
          END,
          retake_reason = CASE
            WHEN review_status = 'RETAKE_REQUIRED' AND completed = false
              THEN retake_reason
            ELSE NULL
          END,
          retake_requested_at = CASE
            WHEN review_status = 'RETAKE_REQUIRED' AND completed = false
              THEN retake_requested_at
            ELSE NULL
          END,
          retake_requested_by_id = CASE
            WHEN review_status = 'RETAKE_REQUIRED' AND completed = false
              THEN retake_requested_by_id
            ELSE NULL
          END,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        stepId,
        body.notes?.trim() || null,
      ],
    );

    await this.recalc(leadId, step.instance_id);

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_STEP_REOPENED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: {
        leadId,
        title: step.title,
        completed: false,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getLeadPursuit(leadId);
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
    if (!file) {
      throw new BadRequestException('Evidence file is required');
    }

    if (
      !allowed.has(file.mimetype) ||
      file.size > 10 * 1024 * 1024
    ) {
      throw new BadRequestException(
        'Unsupported evidence file or file is larger than 10 MB',
      );
    }

    await this.requireStep(leadId, stepId);

    const safe = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );

    const path =
      `lead-evidence/${leadId}/${stepId}/` +
      `${randomUUID()}-${safe}`;

    const upload = await this.supabase.admin.storage
      .from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (upload.error) {
      throw new BadRequestException(
        'Evidence upload failed. Please try again.',
      );
    }

    const evidence = (
      await this.db.query(
        `
          INSERT INTO lead_pursuit_evidence(
            step_id,
            uploaded_by_id,
            file_name,
            storage_path,
            mime_type,
            file_size
          )
          VALUES($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          stepId,
          ctx.actorUserId ?? null,
          file.originalname,
          path,
          file.mimetype,
          file.size,
        ],
      )
    ).rows[0];

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_EVIDENCE_UPLOADED',
      module: 'leads',
      entityType: 'lead_pursuit_evidence',
      entityId: evidence.id,
      newValues: {
        leadId,
        stepId,
        fileName: file.originalname,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return evidence;
  }

  // ============================================================
  // ADMIN REVIEW
  // ============================================================

  async comment(
    leadId: string,
    stepId: string,
    body: any,
    ctx: Ctx,
  ) {
    await this.requireStep(leadId, stepId);

    const comment = body.body?.trim();

    if (!comment) {
      throw new BadRequestException('Comment is required');
    }

    const row = (
      await this.db.query(
        `
          INSERT INTO lead_pursuit_step_comments(
            step_id,
            author_id,
            body
          )
          VALUES($1, $2, $3)
          RETURNING *
        `,
        [
          stepId,
          ctx.actorUserId ?? null,
          comment,
        ],
      )
    ).rows[0];

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_COMMENT_ADDED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: {
        leadId,
        comment,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return row;
  }

  async markReviewed(
    leadId: string,
    stepId: string,
    ctx: Ctx,
  ) {
    const step = await this.requireStep(leadId, stepId);

    if (!step.completed) {
      throw new BadRequestException(
        'Only a completed pursuit step can be marked reviewed',
      );
    }

    await this.db.query(
      `
        UPDATE lead_pursuit_instance_steps
        SET
          review_status = 'APPROVED',
          updated_at = NOW()
        WHERE id = $1
      `,
      [stepId],
    );

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_STEP_REVIEWED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: {
        leadId,
        title: step.title,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // This does NOT gate progression.
    return this.getLeadPursuit(leadId);
  }

  async requestRetake(
    leadId: string,
    stepId: string,
    body: any,
    ctx: Ctx,
  ) {
    const step = await this.requireStep(leadId, stepId);

    if (!step.completed) {
      throw new BadRequestException(
        'Only a completed pursuit step can be sent back for retake',
      );
    }

    const reason = body.reason?.trim();

    if (!reason) {
      throw new BadRequestException(
        'A reason is required when requesting a retake',
      );
    }

    await this.db.query(
      `
        UPDATE lead_pursuit_instance_steps
        SET
          completed = false,
          completed_at = NULL,
          completed_by_id = NULL,
          review_status = 'RETAKE_REQUIRED',
          retake_reason = $2,
          retake_requested_at = NOW(),
          retake_requested_by_id = $3::uuid,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        stepId,
        reason,
        ctx.actorUserId ?? null,
      ],
    );

    await this.recalc(leadId, step.instance_id);

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_RETAKE_REQUESTED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: {
        leadId,
        title: step.title,
        reason,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getLeadPursuit(leadId);
  }

  // ============================================================
  // CUSTOM PURSUIT STEPS
  // ============================================================

  async addCustomStep(
    leadId: string,
    body: any,
    origin: CustomStepOrigin,
    ctx: Ctx,
  ) {
    const title = body.title?.trim();

    if (!title) {
      throw new BadRequestException(
        'Custom pursuit step title is required',
      );
    }

    const instance = (
      await this.db.query(
        `
          SELECT *
          FROM lead_pursuit_instances
          WHERE lead_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [leadId],
      )
    ).rows[0];

    if (!instance) {
      throw new NotFoundException(
        'Lead pursuit instance not found',
      );
    }

    let afterPosition = 0;

    if (body.afterStepId) {
      const afterStep = (
        await this.db.query(
          `
            SELECT *
            FROM lead_pursuit_instance_steps
            WHERE id = $1
              AND instance_id = $2
          `,
          [
            body.afterStepId,
            instance.id,
          ],
        )
      ).rows[0];

      if (!afterStep) {
        throw new BadRequestException(
          'The selected insertion step does not belong to this pursuit',
        );
      }

      afterPosition = afterStep.position;
    } else {
      const maxPosition = (
        await this.db.query(
          `
            SELECT COALESCE(MAX(position), 0)::int AS position
            FROM lead_pursuit_instance_steps
            WHERE instance_id = $1
          `,
          [instance.id],
        )
      ).rows[0].position;

      afterPosition = maxPosition;
    }

    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      // Move later positions safely outside the unique range first.
      await client.query(
        `
          UPDATE lead_pursuit_instance_steps
          SET position = position + 100000
          WHERE instance_id = $1
            AND position > $2
        `,
        [
          instance.id,
          afterPosition,
        ],
      );

      await client.query(
        `
          UPDATE lead_pursuit_instance_steps
          SET position = position - 99999
          WHERE instance_id = $1
            AND position > 100000
        `,
        [instance.id],
      );

      const inserted = (
        await client.query(
          `
            INSERT INTO lead_pursuit_instance_steps(
              instance_id,
              title,
              description,
              position,
              evidence_required,
              step_origin,
              added_by_id,
              review_status
            )
            VALUES(
              $1,
              $2,
              $3,
              $4,
              true,
              $5,
              $6,
              'PENDING'
            )
            RETURNING *
          `,
          [
            instance.id,
            title,
            body.description?.trim() || null,
            afterPosition + 1,
            origin,
            ctx.actorUserId ?? null,
          ],
        )
      ).rows[0];

      await client.query('COMMIT');

      await this.recalc(
        leadId,
        instance.id,
      );

      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action:
          origin === 'ADMIN_REQUIRED'
            ? 'LEAD_PURSUIT_ADMIN_STEP_ADDED'
            : 'LEAD_PURSUIT_STAFF_STEP_ADDED',
        module: 'leads',
        entityType: 'lead_pursuit_step',
        entityId: inserted.id,
        newValues: {
          leadId,
          title,
          origin,
          afterPosition,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return this.getLeadPursuit(leadId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStaffCustomStep(
    leadId: string,
    stepId: string,
    body: any,
    ctx: Ctx,
  ) {
    const step = await this.requireStep(
      leadId,
      stepId,
    );

    if (step.step_origin !== 'STAFF_CUSTOM') {
      throw new BadRequestException(
        'Only staff-created custom pursuit steps can be edited here',
      );
    }

    if (
      step.added_by_id &&
      ctx.actorUserId &&
      step.added_by_id !== ctx.actorUserId
    ) {
      throw new BadRequestException(
        'You can only edit custom steps that you created',
      );
    }

    if (step.completed) {
      throw new BadRequestException(
        'Completed custom steps cannot be edited',
      );
    }

    const title = body.title?.trim();

    if (!title) {
      throw new BadRequestException('Step title is required');
    }

    await this.db.query(
      `
        UPDATE lead_pursuit_instance_steps
        SET
          title = $2,
          description = $3,
          evidence_required = true,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        stepId,
        title,
        body.description?.trim() || null,
      ],
    );

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_STAFF_STEP_UPDATED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      newValues: {
        leadId,
        title,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getLeadPursuit(leadId);
  }

  async deleteStaffCustomStep(
    leadId: string,
    stepId: string,
    ctx: Ctx,
  ) {
    const step = await this.requireStep(
      leadId,
      stepId,
    );

    if (step.step_origin !== 'STAFF_CUSTOM') {
      throw new BadRequestException(
        'Workflow and Admin-required steps cannot be deleted by staff',
      );
    }

    if (
      step.added_by_id &&
      ctx.actorUserId &&
      step.added_by_id !== ctx.actorUserId
    ) {
      throw new BadRequestException(
        'You can only delete custom steps that you created',
      );
    }

    if (step.completed) {
      throw new BadRequestException(
        'Completed custom steps cannot be deleted',
      );
    }

    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      await client.query(
        `
          DELETE FROM lead_pursuit_instance_steps
          WHERE id = $1
        `,
        [stepId],
      );

      // Compact positions in two phases so the unique
      // (instance_id, position) constraint cannot collide mid-update.
      await client.query(
        `
          UPDATE lead_pursuit_instance_steps
          SET position = position + 100000
          WHERE instance_id = $1
        `,
        [step.instance_id],
      );

      const rows = (
        await client.query(
          `
            SELECT id
            FROM lead_pursuit_instance_steps
            WHERE instance_id = $1
            ORDER BY position
          `,
          [step.instance_id],
        )
      ).rows;

      for (let index = 0; index < rows.length; index += 1) {
        await client.query(
          `
            UPDATE lead_pursuit_instance_steps
            SET position = $2
            WHERE id = $1
          `,
          [
            rows[index].id,
            index + 1,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await this.recalc(
      leadId,
      step.instance_id,
    );

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'LEAD_PURSUIT_STAFF_STEP_DELETED',
      module: 'leads',
      entityType: 'lead_pursuit_step',
      entityId: stepId,
      oldValues: {
        leadId,
        title: step.title,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.getLeadPursuit(leadId);
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  private async requireStep(
    leadId: string,
    stepId: string,
  ) {
    const step = (
      await this.db.query(
        `
          SELECT s.*
          FROM lead_pursuit_instance_steps s
          JOIN lead_pursuit_instances i
            ON i.id = s.instance_id
          WHERE s.id = $1
            AND i.lead_id = $2
        `,
        [
          stepId,
          leadId,
        ],
      )
    ).rows[0];

    if (!step) {
      throw new NotFoundException(
        'Pursuit step not found',
      );
    }

    return step;
  }

  private async assertPreviousStepsCompleted(
    instanceId: string,
    position: number,
  ) {
    const previousIncomplete = (
      await this.db.query(
        `
          SELECT id, title
          FROM lead_pursuit_instance_steps
          WHERE instance_id = $1
            AND position < $2
            AND completed = false
          ORDER BY position
          LIMIT 1
        `,
        [
          instanceId,
          position,
        ],
      )
    ).rows[0];

    if (previousIncomplete) {
      throw new BadRequestException(
        `Complete "${previousIncomplete.title}" before continuing`,
      );
    }
  }

  private async recalc(
    leadId: string,
    instanceId: string,
  ) {
    const counts = (
      await this.db.query(
        `
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE completed)::int AS done
          FROM lead_pursuit_instance_steps
          WHERE instance_id = $1
        `,
        [instanceId],
      )
    ).rows[0];

    const progress = counts.total
      ? Math.round(
          (counts.done * 100) /
            counts.total,
        )
      : 0;

    await this.db.query(
      `
        UPDATE leads
        SET
          pursuit_progress = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        leadId,
        progress,
      ],
    );
  }
}
