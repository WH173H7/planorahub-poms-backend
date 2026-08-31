import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

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

export type ContactMethodType =
  | 'EMAIL'
  | 'PHONE'
  | 'LINKEDIN'
  | 'X'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'WEBSITE'
  | 'OTHER';

export type ContactMethodVerificationStatus =
  | 'UNVERIFIED'
  | 'VERIFIED'
  | 'INVALID';

export type ContactMethodInput = {
  type: ContactMethodType;
  value: string;
  label?: string | null;
  isPrimary?: boolean;
  verificationStatus?: ContactMethodVerificationStatus;
  notes?: string | null;
};

type LegacySource = 'CONTACT_EMAIL' | 'CONTACT_PHONE';

@Injectable()
export class ContactsRepository {
  constructor(private readonly db: DatabaseService) {}

  async listByOrganization(organizationId: string) {
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

  async listMethods(contactId: string) {
    const result = await this.db.query(
      `
        SELECT *
        FROM contact_methods
        WHERE contact_id = $1
        ORDER BY is_primary DESC, type, created_at
      `,
      [contactId],
    );

    return result.rows;
  }

  async findMethod(contactId: string, methodId: string) {
    const result = await this.db.query(
      `
        SELECT *
        FROM contact_methods
        WHERE id = $1
          AND contact_id = $2
        LIMIT 1
      `,
      [methodId, contactId],
    );

    return result.rows[0] ?? null;
  }

  async clearPrimaryMethod(
    contactId: string,
    type: ContactMethodType,
    excludeId?: string,
  ) {
    await this.db.query(
      `
        UPDATE contact_methods
        SET
          is_primary = FALSE,
          updated_at = NOW()
        WHERE contact_id = $1
          AND type = $2
          ${excludeId ? 'AND id <> $3' : ''}
      `,
      excludeId ? [contactId, type, excludeId] : [contactId, type],
    );
  }

  async createMethod(
    contactId: string,
    input: ContactMethodInput,
    createdById?: string,
  ) {
    const result = await this.db.query(
      `
        INSERT INTO contact_methods (
          contact_id,
          type,
          value,
          label,
          is_primary,
          verification_status,
          notes,
          created_by_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `,
      [
        contactId,
        input.type,
        input.value,
        input.label ?? null,
        input.isPrimary ?? false,
        input.verificationStatus ?? 'UNVERIFIED',
        input.notes ?? null,
        createdById ?? null,
      ],
    );

    return result.rows[0];
  }

  async updateMethod(
    contactId: string,
    methodId: string,
    input: ContactMethodInput,
  ) {
    const result = await this.db.query(
      `
        UPDATE contact_methods
        SET
          type = $3,
          value = $4,
          label = $5,
          is_primary = $6,
          verification_status = $7,
          notes = $8,
          updated_at = NOW()
        WHERE id = $1
          AND contact_id = $2
        RETURNING *
      `,
      [
        methodId,
        contactId,
        input.type,
        input.value,
        input.label ?? null,
        input.isPrimary ?? false,
        input.verificationStatus ?? 'UNVERIFIED',
        input.notes ?? null,
      ],
    );

    return result.rows[0] ?? null;
  }

  async deleteMethod(contactId: string, methodId: string) {
    const result = await this.db.query(
      `
        DELETE FROM contact_methods
        WHERE id = $1
          AND contact_id = $2
        RETURNING *
      `,
      [methodId, contactId],
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

  async clearPrimary(organizationId: string, excludeId?: string) {
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
      excludeId ? [organizationId, excludeId] : [organizationId],
    );
  }

  async create(input: ContactInput, createdById?: string) {
    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      if (input.isPrimary) {
        await this.clearPrimaryWithClient(client, input.organizationId);
      }

      const result = await client.query(
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
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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

      const contact = result.rows[0];

      await this.syncLegacyMethod(
        client,
        contact.id,
        'EMAIL',
        'CONTACT_EMAIL',
        input.email ?? null,
        createdById,
      );
      await this.syncLegacyMethod(
        client,
        contact.id,
        'PHONE',
        'CONTACT_PHONE',
        input.phone ?? null,
        createdById,
      );

      await client.query('COMMIT');
      return contact;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: string, input: ContactInput) {
    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      if (input.isPrimary) {
        await this.clearPrimaryWithClient(
          client,
          input.organizationId,
          id,
        );
      }

      const result = await client.query(
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

      const contact = result.rows[0] ?? null;

      if (!contact) {
        await client.query('ROLLBACK');
        return null;
      }

      await this.syncLegacyMethod(
        client,
        id,
        'EMAIL',
        'CONTACT_EMAIL',
        input.email ?? null,
        contact.created_by_id ?? undefined,
      );
      await this.syncLegacyMethod(
        client,
        id,
        'PHONE',
        'CONTACT_PHONE',
        input.phone ?? null,
        contact.created_by_id ?? undefined,
      );

      await client.query('COMMIT');
      return contact;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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

  private async clearPrimaryWithClient(
    client: PoolClient,
    organizationId: string,
    excludeId?: string,
  ) {
    await client.query(
      `
        UPDATE contacts
        SET
          is_primary = FALSE,
          updated_at = NOW()
        WHERE organization_id = $1
          AND is_primary = TRUE
          ${excludeId ? 'AND id <> $2' : ''}
      `,
      excludeId ? [organizationId, excludeId] : [organizationId],
    );
  }

  private async syncLegacyMethod(
    client: PoolClient,
    contactId: string,
    type: 'EMAIL' | 'PHONE',
    legacySource: LegacySource,
    value: string | null,
    createdById?: string,
  ) {
    const existing = await client.query(
      `
        SELECT id, value
        FROM contact_methods
        WHERE contact_id = $1
          AND legacy_source = $2
        LIMIT 1
      `,
      [contactId, legacySource],
    );

    const existingRow = existing.rows[0] as
      | { id: string; value: string }
      | undefined;

    if (!value) {
      if (existingRow) {
        await client.query(
          `
            DELETE FROM contact_methods
            WHERE id = $1
          `,
          [existingRow.id],
        );
      }
      return;
    }

    // The legacy contacts.email / contacts.phone value is the canonical
    // primary method for that legacy field. Manual methods remain intact.
    await client.query(
      `
        UPDATE contact_methods
        SET
          is_primary = FALSE,
          updated_at = NOW()
        WHERE contact_id = $1
          AND type = $2
          ${existingRow ? 'AND id <> $3' : ''}
      `,
      existingRow
        ? [contactId, type, existingRow.id]
        : [contactId, type],
    );

    if (existingRow) {
      await client.query(
        `
          UPDATE contact_methods
          SET
            type = $2,
            value = $3,
            label = NULL,
            is_primary = TRUE,
            verification_status = CASE
              WHEN LOWER(value) = LOWER($3) THEN verification_status
              ELSE 'UNVERIFIED'::contact_method_verification_status
            END,
            legacy_source = $4,
            updated_at = NOW()
          WHERE id = $1
        `,
        [existingRow.id, type, value, legacySource],
      );
      return;
    }

    await client.query(
      `
        INSERT INTO contact_methods (
          contact_id,
          type,
          value,
          label,
          is_primary,
          verification_status,
          legacy_source,
          created_by_id
        )
        VALUES (
          $1,
          $2,
          $3,
          NULL,
          TRUE,
          'UNVERIFIED'::contact_method_verification_status,
          $4,
          $5
        )
      `,
      [
        contactId,
        type,
        value,
        legacySource,
        createdById ?? null,
      ],
    );
  }
}
