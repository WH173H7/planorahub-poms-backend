import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export type ActivityType =
  | 'CALL'
  | 'MEETING'
  | 'EMAIL'
  | 'FOLLOW_UP'
  | 'NOTE'
  | 'OTHER';

export type ActivityStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ActivityInput = {
  title: string;
  activityType: ActivityType;
  status: ActivityStatus;
  description?: string | null;
  outcome?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  assignedToId?: string | null;
  scheduledAt?: string | null;
  nextFollowUpAt?: string | null;
};

export type ActivityRow = {
  id: string;
  title: string;
  activity_type: ActivityType;
  status: ActivityStatus;
  description: string | null;
  outcome: string | null;
  organization_id: string | null;
  organization_name: string | null;
  contact_id: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  lead_id: string | null;
  lead_title: string | null;
  assigned_to_id: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  created_by_id: string | null;
  creator_first_name: string | null;
  creator_last_name: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class ActivitiesRepository {
  constructor(private readonly db: DatabaseService) {}

  private selectSql() {
    return `
      SELECT
        a.*,
        o.name AS organization_name,
        c.first_name AS contact_first_name,
        c.last_name AS contact_last_name,
        l.title AS lead_title,
        assignee.first_name AS assignee_first_name,
        assignee.last_name AS assignee_last_name,
        creator.first_name AS creator_first_name,
        creator.last_name AS creator_last_name
      FROM activities a
      LEFT JOIN organizations o ON o.id = a.organization_id
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN leads l ON l.id = a.lead_id
      LEFT JOIN users assignee ON assignee.id = a.assigned_to_id
      LEFT JOIN users creator ON creator.id = a.created_by_id
    `;
  }

  async list(): Promise<ActivityRow[]> {
    const result = await this.db.query(`
      ${this.selectSql()}
      ORDER BY
        CASE
          WHEN a.status IN ('COMPLETED','CANCELLED') THEN 1
          ELSE 0
        END,
        a.scheduled_at NULLS LAST,
        a.created_at DESC
    `);
    return result.rows as ActivityRow[];
  }

  async findById(id: string): Promise<ActivityRow | null> {
    const result = await this.db.query(
      `${this.selectSql()} WHERE a.id = $1 LIMIT 1`,
      [id],
    );
    return (result.rows[0] as ActivityRow | undefined) ?? null;
  }

  async entityExists(
    table: 'organizations' | 'contacts' | 'leads' | 'users',
    id: string,
  ) {
    const result = await this.db.query(
      `SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rowCount === 1;
  }

  async contactBelongsToOrganization(contactId: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT 1 FROM contacts WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [contactId, organizationId],
    );
    return result.rowCount === 1;
  }

  async leadBelongsToOrganization(leadId: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT 1 FROM leads WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [leadId, organizationId],
    );
    return result.rowCount === 1;
  }

  async create(input: ActivityInput, createdById?: string): Promise<ActivityRow> {
    const result = await this.db.query(
      `
        INSERT INTO activities (
          title,
          activity_type,
          status,
          description,
          outcome,
          organization_id,
          contact_id,
          lead_id,
          assigned_to_id,
          created_by_id,
          scheduled_at,
          completed_at,
          next_follow_up_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          CASE WHEN $3 = 'COMPLETED' THEN NOW() ELSE NULL END,
          $12
        )
        RETURNING id
      `,
      [
        input.title,
        input.activityType,
        input.status,
        input.description ?? null,
        input.outcome ?? null,
        input.organizationId ?? null,
        input.contactId ?? null,
        input.leadId ?? null,
        input.assignedToId ?? null,
        createdById ?? null,
        input.scheduledAt ?? null,
        input.nextFollowUpAt ?? null,
      ],
    );
    return (await this.findById(result.rows[0].id))!;
  }

  async update(id: string, input: ActivityInput): Promise<ActivityRow | null> {
    const result = await this.db.query(
      `
        UPDATE activities
        SET
          title = $2,
          activity_type = $3,
          status = $4,
          description = $5,
          outcome = $6,
          organization_id = $7,
          contact_id = $8,
          lead_id = $9,
          assigned_to_id = $10,
          scheduled_at = $11,
          completed_at = CASE
            WHEN $4 = 'COMPLETED' AND completed_at IS NULL THEN NOW()
            WHEN $4 <> 'COMPLETED' THEN NULL
            ELSE completed_at
          END,
          next_follow_up_at = $12,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [
        id,
        input.title,
        input.activityType,
        input.status,
        input.description ?? null,
        input.outcome ?? null,
        input.organizationId ?? null,
        input.contactId ?? null,
        input.leadId ?? null,
        input.assignedToId ?? null,
        input.scheduledAt ?? null,
        input.nextFollowUpAt ?? null,
      ],
    );
    if (!result.rowCount) return null;
    return this.findById(id);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM activities WHERE id = $1`,
      [id],
    );
    return result.rowCount === 1;
  }
}
