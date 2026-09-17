import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export type TeamActivityFilters = {
  search?: string;
  staffId?: string;
  type?: string;
  leadId?: string;
  organizationId?: string;
  from?: string;
  to?: string;
  reviewed?: string;
  reviewerUserId: string;
  limit?: number;
};

const meaningfulActions = [
  'ACTIVITY_CREATED',
  'FOLLOW_UP_SCHEDULED',
  'FOLLOW_UP_COMPLETED',
  'FOLLOW_UP_CANCELLED',
  'FOLLOW_UP_RESCHEDULED',
  'TASK_CREATED',
  'TASK_WORKFLOW_UPDATED',
  'TASK_ACCEPTED',
  'TASK_STARTED',
  'TASK_ATTACHMENT_UPLOADED',
  'TASK_SUBMITTED_FOR_REVIEW',
  'TASK_APPROVED',
  'TASK_REVISION_REQUESTED',
  'TASK_WORKFLOW_STEP_COMPLETED',
  'TASK_WORKFLOW_STEP_REOPENED',
  'GMAIL_MESSAGE_SENT',
  'LEAD_ASSIGNED',
  'LEAD_REASSIGNED',
  'LEAD_ASSIGNMENT_BATCH_CREATED',
  'LEAD_PURSUIT_STEP_COMPLETED',
  'LEAD_PURSUIT_EVIDENCE_UPLOADED',
  'LEAD_PURSUIT_STAFF_STEP_ADDED',
  'LEAD_PURSUIT_ADMIN_STEP_ADDED',
  'LEAD_PURSUIT_RETAKE_REQUESTED',
  'LEAD_PURSUIT_COMMENT_ADDED',
] as const;

const activityJoins = `
  FROM audit_logs al
  LEFT JOIN users actor ON actor.id=al.actor_user_id
  LEFT JOIN leads lead_direct ON al.entity_type='lead' AND lead_direct.id=al.entity_id
  LEFT JOIN organizations org_direct ON org_direct.id=lead_direct.organization_id
  LEFT JOIN lead_pursuit_instance_steps pursuit_step
    ON al.entity_type IN ('lead_pursuit_step','lead_pursuit_evidence')
   AND pursuit_step.id = CASE
     WHEN al.entity_type='lead_pursuit_step' THEN al.entity_id
     ELSE NULLIF(al.new_values->>'stepId','')::uuid
   END
  LEFT JOIN lead_pursuit_instances pursuit_instance ON pursuit_instance.id=pursuit_step.instance_id
  LEFT JOIN leads pursuit_lead ON pursuit_lead.id=pursuit_instance.lead_id
  LEFT JOIN organizations pursuit_org ON pursuit_org.id=pursuit_lead.organization_id
  LEFT JOIN activities activity_direct ON al.entity_type='activity' AND activity_direct.id=al.entity_id
  LEFT JOIN leads activity_lead ON activity_lead.id=activity_direct.lead_id
  LEFT JOIN organizations activity_org ON activity_org.id=COALESCE(activity_direct.organization_id, activity_lead.organization_id)
  LEFT JOIN tasks task_direct ON al.entity_type='task' AND task_direct.id=al.entity_id
  LEFT JOIN tasks task_json ON al.entity_type='task_attachment' AND task_json.id=NULLIF(al.new_values->>'taskId','')::uuid
  LEFT JOIN leads task_lead ON task_lead.id=COALESCE(task_direct.lead_id,task_json.lead_id)
  LEFT JOIN organizations task_org ON task_org.id=COALESCE(task_direct.organization_id,task_json.organization_id,task_lead.organization_id)
  LEFT JOIN leads lead_json ON lead_json.id=NULLIF(al.new_values->>'leadId','')::uuid
  LEFT JOIN organizations org_json ON org_json.id=COALESCE(lead_json.organization_id,NULLIF(al.new_values->>'organizationId','')::uuid)
`;

function itemSelect(reviewerParam: string) {
  return `
    SELECT
      al.id,
      al.action,
      al.module,
      al.entity_type,
      al.entity_id,
      al.new_values,
      al.old_values,
      al.created_at,
      al.actor_user_id,
      actor.first_name AS actor_first_name,
      actor.last_name AS actor_last_name,
      actor.email AS actor_email,
      (tar.reviewed_at IS NOT NULL) AS reviewed,
      tar.reviewed_at,
      tar.review_note,
      COALESCE(
        CASE WHEN al.entity_type='lead' THEN lead_direct.id END,
        CASE WHEN al.entity_type IN ('lead_pursuit_step','lead_pursuit_evidence') THEN pursuit_lead.id END,
        CASE WHEN al.entity_type='activity' THEN activity_lead.id END,
        CASE WHEN al.entity_type='task' THEN task_lead.id END,
        NULLIF(al.new_values->>'leadId','')::uuid
      ) AS lead_id,
      COALESCE(lead_direct.title,pursuit_lead.title,activity_lead.title,task_lead.title,lead_json.title) AS lead_title,
      COALESCE(
        lead_direct.organization_id,pursuit_lead.organization_id,activity_lead.organization_id,task_lead.organization_id,
        activity_org.id,task_org.id,NULLIF(al.new_values->>'organizationId','')::uuid
      ) AS organization_id,
      COALESCE(org_direct.name,pursuit_org.name,activity_org.name,task_org.name,org_json.name) AS organization_name,
      COALESCE(
        CASE WHEN al.entity_type='task' THEN task_direct.id END,
        CASE WHEN al.entity_type='task_attachment' THEN task_json.id END
      ) AS task_id,
      COALESCE(task_direct.title,task_json.title) AS task_title,
      CASE WHEN al.entity_type='activity' THEN activity_direct.id ELSE NULL END AS activity_id,
      activity_direct.title AS activity_title
    ${activityJoins}
    LEFT JOIN team_activity_reviews tar
      ON tar.activity_id=al.id
     AND tar.reviewer_user_id=${reviewerParam}::uuid
  `;
}

@Injectable()
export class TeamActivityService {
  constructor(private readonly db: DatabaseService) {}

  async list(filters: TeamActivityFilters) {
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 250);
    const search = filters.search?.trim() || null;
    const leadId = filters.leadId?.trim() || null;
    const organizationId = filters.organizationId?.trim() || null;
    const staffId = filters.staffId?.trim() || null;
    const type = filters.type?.trim() || null;
    const from = filters.from?.trim() || null;
    const to = filters.to?.trim() || null;
    const reviewFilter = filters.reviewed === 'true' ? true : filters.reviewed === 'false' ? false : null;

    const result = await this.db.query(
      `${itemSelect('$10')}
      WHERE al.action = ANY($1::text[])
        AND ($2::uuid IS NULL OR al.actor_user_id=$2)
        AND ($3::text IS NULL OR al.action=$3)
        AND ($4::timestamptz IS NULL OR al.created_at >= $4)
        AND ($5::timestamptz IS NULL OR al.created_at < $5::timestamptz + interval '1 day')
        AND (
          $6::text IS NULL
          OR CONCAT_WS(' ',actor.first_name,actor.last_name,actor.email,al.action,al.module,al.entity_type,al.new_values::text) ILIKE '%' || $6 || '%'
        )
        AND (
          $7::uuid IS NULL
          OR COALESCE(
            CASE WHEN al.entity_type='lead' THEN lead_direct.id END,
            CASE WHEN al.entity_type IN ('lead_pursuit_step','lead_pursuit_evidence') THEN pursuit_lead.id END,
            CASE WHEN al.entity_type='activity' THEN activity_lead.id END,
            CASE WHEN al.entity_type='task' THEN task_lead.id END,
            NULLIF(al.new_values->>'leadId','')::uuid
          ) = $7::uuid
        )
        AND (
          $8::uuid IS NULL
          OR COALESCE(
            lead_direct.organization_id,pursuit_lead.organization_id,activity_lead.organization_id,task_lead.organization_id,
            activity_org.id,task_org.id,NULLIF(al.new_values->>'organizationId','')::uuid
          ) = $8::uuid
        )
        AND ($9::boolean IS NULL OR (tar.reviewed_at IS NOT NULL)=$9)
      ORDER BY al.created_at DESC
      LIMIT $11`,
      [meaningfulActions, staffId, type, from, to, search, leadId, organizationId, reviewFilter, filters.reviewerUserId, limit],
    );

    const [staff, leads, organizations] = await Promise.all([
      this.db.query(`
        SELECT id, first_name, last_name, email
        FROM users
        WHERE status='ACTIVE'
        ORDER BY first_name, last_name
      `),
      this.db.query(`
        SELECT l.id, l.title, o.name AS organization_name
        FROM leads l
        LEFT JOIN organizations o ON o.id=l.organization_id
        WHERE l.record_type='LEAD'
        ORDER BY l.title
        LIMIT 500
      `),
      this.db.query(`
        SELECT id, name
        FROM organizations
        ORDER BY name
        LIMIT 500
      `),
    ]);

    return {
      items: result.rows,
      staff: staff.rows,
      types: meaningfulActions,
      leads: leads.rows,
      organizations: organizations.rows,
    };
  }

  async detail(activityId: string, reviewerUserId: string) {
    if (!activityId) throw new BadRequestException('Activity id is required.');

    const result = await this.db.query(
      `${itemSelect('$2')}
       WHERE al.id=$1::uuid AND al.action=ANY($3::text[])
       LIMIT 1`,
      [activityId, reviewerUserId, meaningfulActions],
    );

    const item = result.rows[0];
    if (!item) throw new NotFoundException('Team activity event not found.');
    return item;
  }

  async setReview(
    activityId: string,
    reviewerUserId: string,
    input: { reviewed?: boolean; response?: string | null },
  ) {
    if (!activityId) throw new BadRequestException('Activity id is required.');

    const exists = await this.db.query(
      `SELECT id FROM audit_logs WHERE id=$1 AND action=ANY($2::text[]) LIMIT 1`,
      [activityId, meaningfulActions],
    );
    if (!exists.rows[0]) throw new NotFoundException('Team activity event not found.');

    const responseProvided = Object.prototype.hasOwnProperty.call(input, 'response');
    const response = responseProvided ? input.response?.trim() || null : undefined;

    if (responseProvided && response && response.length > 4000) {
      throw new BadRequestException('Review response must be 4,000 characters or fewer.');
    }

    const requestedReviewed = input.reviewed;
    const reviewed = responseProvided && response ? true : requestedReviewed;

    const result = await this.db.query(
      `
      INSERT INTO team_activity_reviews (
        activity_id, reviewer_user_id, reviewed_at, review_note, updated_at
      )
      VALUES (
        $1,$2,
        CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
        $4,
        NOW()
      )
      ON CONFLICT (activity_id, reviewer_user_id)
      DO UPDATE SET
        reviewed_at = CASE
          WHEN $3::boolean IS NULL THEN team_activity_reviews.reviewed_at
          WHEN $3::boolean THEN COALESCE(team_activity_reviews.reviewed_at, NOW())
          ELSE NULL
        END,
        review_note = CASE
          WHEN $5::boolean THEN $4
          ELSE team_activity_reviews.review_note
        END,
        updated_at = NOW()
      RETURNING activity_id, reviewed_at, review_note, updated_at
      `,
      [activityId, reviewerUserId, reviewed ?? false, response ?? null, responseProvided],
    );

    const row = result.rows[0];
    return {
      activityId: row.activity_id,
      reviewed: Boolean(row.reviewed_at),
      reviewedAt: row.reviewed_at,
      response: row.review_note,
      updatedAt: row.updated_at,
    };
  }
}
