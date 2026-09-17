import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export type ContactInput = {
  organizationId: string;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
};

@Injectable()
export class ContactsRepository {
  constructor(
    private readonly db: DatabaseService,
  ) {}

  async listByOrganization(
    organizationId: string,
  ) {
    const result = await this.db.query(
      `
        SELECT
          c.*,
          creator.first_name AS creator_first_name,
          creator.last_name AS creator_last_name
        FROM contacts c
        LEFT JOIN users creator
          ON creator.id = c.created_by_id
        WHERE c.organization_id = $1
        ORDER BY
          c.is_primary DESC,
          c.first_name,
          c.last_name
      `,
      [organizationId],
    );

    return result.rows;
  }

  async listAll() {
    const result = await this.db.query(
      `
        SELECT
          c.*,
          o.name AS organization_name,
          o.organization_type,
          o.status AS organization_status
        FROM contacts c
        JOIN organizations o
          ON o.id = c.organization_id
        ORDER BY c.created_at DESC
      `,
    );

    return result.rows;
  }

  async findById(id: string) {
    const result = await this.db.query(
      `
        SELECT
          c.*,
          o.name AS organization_name
        FROM contacts c
        JOIN organizations o
          ON o.id = c.organization_id
        WHERE c.id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async organizationExists(id: string) {
    const result = await this.db.query(
      `
        SELECT 1
        FROM organizations
        WHERE id = $1
          AND status <> 'ARCHIVED'
        LIMIT 1
      `,
      [id],
    );

    return result.rowCount === 1;
  }

  async clearPrimary(
    organizationId: string,
    excludeId?: string,
  ) {
    await this.db.query(
      `
        UPDATE contacts
        SET
          is_primary = FALSE,
          updated_at = NOW()
        WHERE organization_id = $1
          AND is_primary = TRUE
          ${excludeId ? 'AND id <> $2' : ''}
      `,
      excludeId
        ? [organizationId, excludeId]
        : [organizationId],
    );
  }

  async create(
    input: ContactInput,
    createdById?: string,
  ) {
    const result = await this.db.query(
      `
        INSERT INTO contacts (
          organization_id,
          first_name,
          last_name,
          job_title,
          email,
          phone,
          is_primary,
          notes,
          created_by_id
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9
        )
        RETURNING *
      `,
      [
        input.organizationId,
        input.firstName,
        input.lastName,
        input.jobTitle ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.isPrimary ?? false,
        input.notes ?? null,
        createdById ?? null,
      ],
    );

    return result.rows[0];
  }

  async update(
    id: string,
    input: ContactInput,
  ) {
    const result = await this.db.query(
      `
        UPDATE contacts
        SET
          organization_id = $2,
          first_name = $3,
          last_name = $4,
          job_title = $5,
          email = $6,
          phone = $7,
          is_primary = $8,
          notes = $9,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        input.organizationId,
        input.firstName,
        input.lastName,
        input.jobTitle ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.isPrimary ?? false,
        input.notes ?? null,
      ],
    );

    return result.rows[0] ?? null;
  }

  async delete(id: string) {
    const result = await this.db.query(
      `
        DELETE FROM contacts
        WHERE id = $1
        RETURNING *
      `,
      [id],
    );

    return result.rows[0] ?? null;
  }
}
