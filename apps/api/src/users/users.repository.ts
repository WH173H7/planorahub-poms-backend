import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

type StaffRow = {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  role_id: string;
  department_id: string | null;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  must_change_password: boolean;
  password_changed_at: Date | null;
  last_login_at: Date | null;
  created_by_id: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByEmail(email: string) {
    const result = await this.db.query<StaffRow>(
      `
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email],
    );

    return result.rows[0] ?? null;
  }

  async findById(id: string) {
    const result = await this.db.query<StaffRow>(
      `
      SELECT *
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async listStaff() {
    const result = await this.db.query(
      `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.job_title,
        u.status,
        u.must_change_password,
        u.last_login_at,
        u.created_at,

        r.id AS role_id,
        r.code AS role_code,
        r.name AS role_name,

        d.id AS department_id,
        d.name AS department_name

      FROM users u

      JOIN roles r
        ON r.id = u.role_id

      LEFT JOIN departments d
        ON d.id = u.department_id

      ORDER BY
        u.created_at DESC
      `,
    );

    return result.rows;
  }

  async roleExists(roleId: string) {
    const result = await this.db.query(
      `
      SELECT id
      FROM roles
      WHERE id = $1
      LIMIT 1
      `,
      [roleId],
    );

    return result.rowCount === 1;
  }

  async departmentExists(departmentId: string) {
    const result = await this.db.query(
      `
      SELECT id
      FROM departments
      WHERE id = $1
      LIMIT 1
      `,
      [departmentId],
    );

    return result.rowCount === 1;
  }

  async teamsExist(teamIds: string[]) {
    if (teamIds.length === 0) {
      return true;
    }

    const result = await this.db.query<{ id: string }>(
      `
      SELECT id
      FROM teams
      WHERE id = ANY($1::uuid[])
      `,
      [teamIds],
    );

    return result.rows.length === new Set(teamIds).size;
  }

  async permissionsExist(permissionIds: string[]) {
    if (permissionIds.length === 0) {
      return true;
    }

    const result = await this.db.query<{ id: string }>(
      `
      SELECT id
      FROM permissions
      WHERE id = ANY($1::uuid[])
      `,
      [permissionIds],
    );

    return result.rows.length === new Set(permissionIds).size;
  }

  async createStaff(params: {
    authUserId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    jobTitle?: string;
    roleId: string;
    departmentId?: string;
    createdById?: string;
  }) {
    const result = await this.db.query<StaffRow>(
      `
      INSERT INTO users (
        auth_user_id,
        first_name,
        last_name,
        email,
        phone,
        job_title,
        role_id,
        department_id,
        status,
        must_change_password,
        created_by_id
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'INVITED',
        TRUE,
        $9
      )
      RETURNING *
      `,
      [
        params.authUserId,
        params.firstName,
        params.lastName,
        params.email,
        params.phone ?? null,
        params.jobTitle ?? null,
        params.roleId,
        params.departmentId ?? null,
        params.createdById ?? null,
      ],
    );

    return result.rows[0];
  }

  async addTeamMemberships(userId: string, teamIds: string[]) {
    for (const teamId of teamIds) {
      await this.db.query(
        `
        INSERT INTO team_members (
          team_id,
          user_id
        )
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [teamId, userId],
      );
    }
  }

  async addPermissionOverrides(
    userId: string,
    overrides: Array<{
      permissionId: string;
      effect: 'ALLOW' | 'DENY';
      reason?: string;
    }>,
    grantedById?: string,
  ) {
    for (const override of overrides) {
      await this.db.query(
        `
        INSERT INTO user_permission_overrides (
          user_id,
          permission_id,
          effect,
          reason,
          granted_by_id
        )
        VALUES ($1, $2, $3, $4, $5)

        ON CONFLICT (user_id, permission_id)

        DO UPDATE SET
          effect = EXCLUDED.effect,
          reason = EXCLUDED.reason,
          granted_by_id = EXCLUDED.granted_by_id,
          updated_at = NOW()
        `,
        [
          userId,
          override.permissionId,
          override.effect,
          override.reason ?? null,
          grantedById ?? null,
        ],
      );
    }
  }

  async deleteInternalUser(userId: string) {
    await this.db.query(
      `
      DELETE FROM users
      WHERE id = $1
      `,
      [userId],
    );
  }
}
