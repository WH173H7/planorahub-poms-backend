import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class PermissionsService {
  constructor(private readonly db: DatabaseService) {}

  async hasPermission(
    userId: string,
    permissionCode: string,
  ): Promise<boolean> {
    // Explicit user DENY always wins.
    const deny = await this.db.query(
      `
      SELECT 1
      FROM user_permission_overrides upo
      JOIN permissions p
        ON p.id = upo.permission_id
      WHERE upo.user_id = $1
        AND p.code = $2
        AND upo.effect = 'DENY'
      LIMIT 1
      `,
      [userId, permissionCode],
    );

    if (deny.rowCount) {
      return false;
    }

    // Explicit user ALLOW.
    const allow = await this.db.query(
      `
      SELECT 1
      FROM user_permission_overrides upo
      JOIN permissions p
        ON p.id = upo.permission_id
      WHERE upo.user_id = $1
        AND p.code = $2
        AND upo.effect = 'ALLOW'
      LIMIT 1
      `,
      [userId, permissionCode],
    );

    if (allow.rowCount) {
      return true;
    }

    // Otherwise inherit from role.
    const inherited = await this.db.query(
      `
      SELECT 1
      FROM users u
      JOIN role_permissions rp
        ON rp.role_id = u.role_id
      JOIN permissions p
        ON p.id = rp.permission_id
      WHERE u.id = $1
        AND p.code = $2
      LIMIT 1
      `,
      [userId, permissionCode],
    );

    return Boolean(inherited.rowCount);
  }

  async getEffectivePermissions(userId: string) {
    const result = await this.db.query<{ code: string }>(
      `
      WITH role_grants AS (
        SELECT p.code
        FROM users u
        JOIN role_permissions rp
          ON rp.role_id = u.role_id
        JOIN permissions p
          ON p.id = rp.permission_id
        WHERE u.id = $1
      ),

      explicit_allows AS (
        SELECT p.code
        FROM user_permission_overrides upo
        JOIN permissions p
          ON p.id = upo.permission_id
        WHERE upo.user_id = $1
          AND upo.effect = 'ALLOW'
      ),

      explicit_denies AS (
        SELECT p.code
        FROM user_permission_overrides upo
        JOIN permissions p
          ON p.id = upo.permission_id
        WHERE upo.user_id = $1
          AND upo.effect = 'DENY'
      ),

      combined AS (
        SELECT code FROM role_grants
        UNION
        SELECT code FROM explicit_allows
      )

      SELECT code
      FROM combined
      WHERE code NOT IN (
        SELECT code FROM explicit_denies
      )
      ORDER BY code
      `,
      [userId],
    );

    return result.rows.map((row) => row.code);
  }
}