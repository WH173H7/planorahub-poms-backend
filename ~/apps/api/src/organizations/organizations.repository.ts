import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export type OrganizationType =
  | 'PROSPECT'
  | 'CUSTOMER'
  | 'PARTNER'
  | 'OTHER';

export type OrganizationStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ARCHIVED';

export type OrganizationInput = {
  name: string;
  legalName?: string | null;
  organizationType: OrganizationType;
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
  assignedOwnerId?: string | null;
};

@Injectable()
export class OrganizationsRepository {
  constructor(
    private readonly db: DatabaseService,
  ) {}

  async list() {
    const result = await this.db.query(
      `
        SELECT
          o.*,
          owner.first_name AS owner_first_name,
          owner.last_name AS owner_last_name,
          owner.email AS owner_email,
          creator.first_name AS creator_first_name,
          creator.last_name AS creator_last_name
        FROM organizations o
        LEFT JOIN users owner
          ON owner.id = o.assigned_owner_id
        LEFT JOIN users creator
          ON creator.id = o.created_by_id
        ORDER BY
          CASE WHEN o.status = 'ARCHIVED' THEN 1 ELSE 0 END,
          o.created_at DESC
      `,
    );

    return result.rows;
  }

  async findById(id: string) {
    const result = await this.db.query(
      `
        SELECT
          o.*,
          owner.first_name AS owner_first_name,
          owner.last_name AS owner_last_name,
          owner.email AS owner_email,
          creator.first_name AS creator_first_name,
          creator.last_name AS creator_last_name
        FROM organizations o
        LEFT JOIN users owner
          ON owner.id = o.assigned_owner_id
        LEFT JOIN users creator
          ON creator.id = o.created_by_id
        WHERE o.id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async findDuplicateName(
    name: string,
    excludeId?: string,
  ) {
    const params: unknown[] = [name];

    let sql = `
      SELECT id, name
      FROM organizations
      WHERE LOWER(name) = LOWER($1)
    `;

    if (excludeId) {
      params.push(excludeId);
      sql += ` AND id <> $2`;
    }

    sql += ` LIMIT 1`;

    const result =
      await this.db.query(sql, params);

    return result.rows[0] ?? null;
  }

  async userExists(id: string) {
    const result = await this.db.query(
      `
        SELECT 1
        FROM users
        WHERE id = $1
          AND status NOT IN ('DISABLED')
        LIMIT 1
      `,
      [id],
    );

    return result.rowCount === 1;
  }

  async create(
    input: OrganizationInput,
    createdById?: string,
  ) {
    const result = await this.db.query(
      `
        INSERT INTO organizations (
          name,
          legal_name,
          organization_type,
          industry,
          email,
          phone,
          website,
          address_line1,
          address_line2,
          city,
          state,
          country,
          notes,
          assigned_owner_id,
          created_by_id
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15
        )
        RETURNING *
      `,
      [
        input.name,
        input.legalName ?? null,
        input.organizationType,
        input.industry ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.website ?? null,
        input.addressLine1 ?? null,
        input.addressLine2 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.country ?? null,
        input.notes ?? null,
        input.assignedOwnerId ?? null,
        createdById ?? null,
      ],
    );

    return result.rows[0];
  }

  async update(
    id: string,
    input: OrganizationInput,
  ) {
    const result = await this.db.query(
      `
        UPDATE organizations
        SET
          name = $2,
          legal_name = $3,
          organization_type = $4,
          industry = $5,
          email = $6,
          phone = $7,
          website = $8,
          address_line1 = $9,
          address_line2 = $10,
          city = $11,
          state = $12,
          country = $13,
          notes = $14,
          assigned_owner_id = $15,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        input.name,
        input.legalName ?? null,
        input.organizationType,
        input.industry ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.website ?? null,
        input.addressLine1 ?? null,
        input.addressLine2 ?? null,
        input.city ?? null,
        input.state ?? null,
        input.country ?? null,
        input.notes ?? null,
        input.assignedOwnerId ?? null,
      ],
    );

    return result.rows[0] ?? null;
  }

  async setStatus(
    id: string,
    status: OrganizationStatus,
  ) {
    const result = await this.db.query(
      `
        UPDATE organizations
        SET
          status = $2,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id, status],
    );

    return result.rows[0] ?? null;
  }
}
