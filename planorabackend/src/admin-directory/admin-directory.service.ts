import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

type DepartmentInput = {
  name?: string;
  description?: string;
  roleIds?: string[];
};

type TeamInput = {
  name?: string;
  description?: string;
  departmentId?: string;
  managerId?: string | null;
};

@Injectable()
export class AdminDirectoryService {
  constructor(
    private readonly db: DatabaseService,
  ) {}

  async getRoles() {
    const result = await this.db.query(
      `
      SELECT
        r.id,
        r.code,
        r.name,
        r.description,
        r.is_system_role,
        COALESCE(r.is_active, TRUE) AS is_active,
        (
          SELECT COUNT(*)::int
          FROM users u
          WHERE u.role_id = r.id
        ) AS staff_count,

        COALESCE(
          (
            SELECT ARRAY_AGG(
              rd.department_id
              ORDER BY rd.department_id
            )
            FROM role_departments rd
            WHERE rd.role_id = r.id
          ),
          ARRAY[]::uuid[]
        ) AS department_ids,

        COALESCE(
          (
            SELECT JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'id', p.id,
                'code', p.code,
                'name', p.name,
                'module', p.module,
                'description', p.description
              )
              ORDER BY p.module, p.name
            )
            FROM role_permissions rp
            JOIN permissions p
              ON p.id = rp.permission_id
            WHERE rp.role_id = r.id
          ),
          '[]'::jsonb
        ) AS permissions

      FROM roles r
      ORDER BY r.name ASC
      `,
    );

    return result.rows;
  }

  async createRole(params: {
    name?: string;
    description?: string;
    permissionIds?: string[];
  }) {
    const name = params.name?.trim();
    if (!name) {
      throw new BadRequestException('Role name is required');
    }

    const duplicate = await this.db.query(
      `SELECT id FROM roles WHERE LOWER(name)=LOWER($1) LIMIT 1`,
      [name],
    );
    if (duplicate.rowCount) {
      throw new ConflictException('A role with this name already exists');
    }

    const code = await this.nextRoleCode(name);
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      description: string | null;
    }>(
      `INSERT INTO roles(code,name,description,is_system_role,is_active)
       VALUES($1,$2,$3,FALSE,TRUE)
       RETURNING id,code,name,description`,
      [code, name, params.description?.trim() || null],
    );

    const role = result.rows[0];
    await this.syncRolePermissions(role.id, params.permissionIds ?? []);
    return (await this.getRoleById(role.id))!;
  }

  async updateRole(
    id: string,
    params: {
      name?: string;
      description?: string;
      permissionIds?: string[];
      isActive?: boolean;
    },
  ) {
    const existing = await this.getRoleById(id);
    if (!existing) {
      throw new NotFoundException('Role not found');
    }

    if (existing.code === 'SUPER_ADMIN') {
      throw new BadRequestException('The Super Admin role is protected');
    }

    if (existing.is_system_role && existing.code !== 'MARKETING') {
      throw new BadRequestException('This legacy system role is archived and cannot be edited');
    }

    if (existing.code === 'MARKETING' && (params.name !== undefined || params.isActive === false)) {
      throw new BadRequestException('The built-in Marketing role cannot be renamed or archived');
    }

    const name = params.name?.trim();
    if (name) {
      const duplicate = await this.db.query(
        `SELECT id FROM roles WHERE LOWER(name)=LOWER($1) AND id<>$2 LIMIT 1`,
        [name, id],
      );
      if (duplicate.rowCount) {
        throw new ConflictException('A role with this name already exists');
      }
    }

    await this.db.query(
      `UPDATE roles
       SET name=COALESCE($2,name),
           description=CASE WHEN $3::boolean THEN $4 ELSE description END,
           is_active=COALESCE($5,is_active),
           updated_at=NOW()
       WHERE id=$1`,
      [
        id,
        existing.code === 'MARKETING' ? null : name || null,
        params.description !== undefined,
        params.description === undefined ? null : params.description.trim() || null,
        existing.code === 'MARKETING' ? null : params.isActive ?? null,
      ],
    );

    if (params.permissionIds !== undefined) {
      await this.syncRolePermissions(id, params.permissionIds);
    }

    return (await this.getRoleById(id))!;
  }

  private async getRoleById(id: string) {
    const result = await this.db.query(
      `SELECT r.id,r.code,r.name,r.description,r.is_system_role,
              COALESCE(r.is_active,TRUE) AS is_active,
              (SELECT COUNT(*)::int FROM users u WHERE u.role_id=r.id) AS staff_count,
              COALESCE((
                SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                  'id',p.id,'code',p.code,'name',p.name,'module',p.module,'description',p.description
                ) ORDER BY p.module,p.name)
                FROM role_permissions rp
                JOIN permissions p ON p.id=rp.permission_id
                WHERE rp.role_id=r.id
              ),'[]'::jsonb) AS permissions
       FROM roles r WHERE r.id=$1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  private async nextRoleCode(name: string) {
    const base = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'CUSTOM_ROLE';

    let code = base;
    let suffix = 2;
    while ((await this.db.query(`SELECT 1 FROM roles WHERE code=$1 LIMIT 1`, [code])).rowCount) {
      code = `${base.slice(0, 58)}_${suffix++}`;
    }
    return code;
  }

  private async validatePermissionIds(permissionIds: string[]) {
    const unique = [...new Set(permissionIds)];
    if (!unique.length) return unique;
    const result = await this.db.query<{ id: string }>(
      `SELECT id FROM permissions WHERE id=ANY($1::uuid[])`,
      [unique],
    );
    if (result.rows.length !== unique.length) {
      throw new BadRequestException('One or more selected permissions are invalid');
    }
    return unique;
  }

  private async syncRolePermissions(roleId: string, permissionIds: string[]) {
    const unique = await this.validatePermissionIds(permissionIds);
    await this.db.query(`DELETE FROM role_permissions WHERE role_id=$1`, [roleId]);
    if (!unique.length) return;
    await this.db.query(
      `INSERT INTO role_permissions(role_id,permission_id)
       SELECT $1::uuid,selected.permission_id
       FROM UNNEST($2::uuid[]) AS selected(permission_id)
       ON CONFLICT DO NOTHING`,
      [roleId, unique],
    );
  }


  async getRoleOverview(id: string) {
    const role = await this.getRoleById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const [staff, departments, associations, activity] = await Promise.all([
      this.db.query(
        `SELECT u.id,u.first_name,u.last_name,u.email,u.job_title,u.status,d.name department_name
         FROM users u
         LEFT JOIN departments d ON d.id=u.department_id
         WHERE u.role_id=$1 AND u.status<>'DISABLED'
         ORDER BY CASE WHEN u.status='ACTIVE' THEN 0 ELSE 1 END,u.first_name,u.last_name`,
        [id],
      ),
      this.db.query(
        `SELECT d.id,d.name,d.description,COALESCE(d.is_active,TRUE) is_active
         FROM role_departments rd
         JOIN departments d ON d.id=rd.department_id
         WHERE rd.role_id=$1
         ORDER BY d.name`,
        [id],
      ),
      this.db.query(
        `SELECT
          (SELECT COUNT(*)::int FROM task_workflows WHERE role_id=$1) workflows,
          (SELECT COUNT(*)::int FROM shared_item_access WHERE subject_type='ROLE' AND subject_id=$1) shared_items,
          (SELECT COUNT(*)::int FROM letter_approval_exemptions WHERE subject_type='ROLE' AND subject_id=$1) letter_exemptions`,
        [id],
      ),
      this.db.query(
        `SELECT al.id,al.action,al.module,al.entity_type,al.entity_id,al.created_at,u.first_name,u.last_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id=al.actor_user_id
         WHERE al.actor_user_id IN(SELECT id FROM users WHERE role_id=$1)
            OR (al.entity_type='role' AND al.entity_id=$1)
         ORDER BY al.created_at DESC
         LIMIT 16`,
        [id],
      ),
    ]);

    return {
      role,
      staff: staff.rows,
      departments: departments.rows,
      associations: associations.rows[0],
      activity: activity.rows,
    };
  }

  async deleteRole(id: string, reassignRoleId: string | null) {
    const existing = await this.getRoleById(id);
    if (!existing) {
      throw new NotFoundException('Role not found');
    }
    if (existing.is_system_role || existing.code === 'MARKETING' || existing.code === 'SUPER_ADMIN') {
      throw new BadRequestException('Built-in and system roles cannot be deleted');
    }
    if (reassignRoleId === id) {
      throw new BadRequestException('Choose a different replacement role');
    }

    if (reassignRoleId) {
      const replacement = await this.getRoleById(reassignRoleId);
      if (!replacement || replacement.is_active === false) {
        throw new BadRequestException('Replacement role must be active');
      }
    }

    const dependencies = (
      await this.db.query(
        `SELECT
          (SELECT COUNT(*)::int FROM users WHERE role_id=$1 AND status<>'DISABLED') staff,
          (SELECT COUNT(*)::int FROM task_workflows WHERE role_id=$1) workflows`,
        [id],
      )
    ).rows[0];

    if ((dependencies.staff || dependencies.workflows) && !reassignRoleId) {
      throw new BadRequestException('Choose an active replacement role before deleting this role');
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE users SET role_id=$2,updated_at=NOW() WHERE role_id=$1`, [id, reassignRoleId]);
      await client.query(`UPDATE task_workflows SET role_id=$2 WHERE role_id=$1`, [id, reassignRoleId]);

      if (reassignRoleId) {
        await client.query(
          `DELETE FROM shared_item_access old
           WHERE old.subject_type='ROLE' AND old.subject_id=$1
             AND EXISTS(
               SELECT 1 FROM shared_item_access dup
               WHERE dup.item_type=old.item_type
                 AND dup.item_id=old.item_id
                 AND dup.subject_type='ROLE'
                 AND dup.subject_id=$2
             )`,
          [id, reassignRoleId],
        );
        await client.query(
          `UPDATE shared_item_access SET subject_id=$2 WHERE subject_type='ROLE' AND subject_id=$1`,
          [id, reassignRoleId],
        );
        await client.query(
          `DELETE FROM letter_approval_exemptions old
           WHERE old.subject_type='ROLE' AND old.subject_id=$1
             AND EXISTS(
               SELECT 1 FROM letter_approval_exemptions dup
               WHERE dup.subject_type='ROLE' AND dup.subject_id=$2
             )`,
          [id, reassignRoleId],
        );
        await client.query(
          `UPDATE letter_approval_exemptions SET subject_id=$2 WHERE subject_type='ROLE' AND subject_id=$1`,
          [id, reassignRoleId],
        );
      } else {
        await client.query(`DELETE FROM shared_item_access WHERE subject_type='ROLE' AND subject_id=$1`, [id]);
        await client.query(`DELETE FROM letter_approval_exemptions WHERE subject_type='ROLE' AND subject_id=$1`, [id]);
      }

      await client.query(`DELETE FROM roles WHERE id=$1`, [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { id, reassignedToRoleId: reassignRoleId };
  }

  async getPermissions() {
    const result = await this.db.query(
      `
      SELECT
        id,
        code,
        name,
        module,
        description
      FROM permissions
      ORDER BY module ASC, name ASC
      `,
    );

    return result.rows;
  }

  async getDepartments() {
    const result = await this.db.query(
      `
      SELECT
        d.id,
        d.name,
        d.description,
        d.created_at,
        d.updated_at,

        (
          SELECT COUNT(*)::int
          FROM users u
          WHERE u.department_id = d.id
        ) AS staff_count,

        (
          SELECT COUNT(*)::int
          FROM teams t
          WHERE t.department_id = d.id
        ) AS team_count,

        COALESCE(
          (
            SELECT JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'id', r.id,
                'code', r.code,
                'name', r.name
              )
              ORDER BY r.name
            )
            FROM role_departments rd
            JOIN roles r
              ON r.id = rd.role_id
            WHERE rd.department_id = d.id
          ),
          '[]'::jsonb
        ) AS roles

      FROM departments d
      ORDER BY d.name ASC
      `,
    );

    return result.rows;
  }

  private async validateRoleIds(
    roleIds: string[],
  ) {
    if (roleIds.length === 0) {
      return;
    }

    const result = await this.db.query<{
      id: string;
    }>(
      `
      SELECT id
      FROM roles
      WHERE id = ANY($1::uuid[])
      `,
      [roleIds],
    );

    if (result.rows.length !== roleIds.length) {
      throw new BadRequestException(
        'One or more selected roles are invalid',
      );
    }
  }

  private async syncDepartmentRoles(
    departmentId: string,
    roleIds: string[],
  ) {
    const uniqueRoleIds = [
      ...new Set(roleIds),
    ];

    await this.validateRoleIds(
      uniqueRoleIds,
    );

    await this.db.query(
      `
      DELETE FROM role_departments
      WHERE department_id = $1
      `,
      [departmentId],
    );

    if (uniqueRoleIds.length === 0) {
      return;
    }

    await this.db.query(
      `
      INSERT INTO role_departments (
        role_id,
        department_id
      )
      SELECT
        role_id,
        $1::uuid
      FROM UNNEST($2::uuid[])
        AS role_id
      ON CONFLICT DO NOTHING
      `,
      [
        departmentId,
        uniqueRoleIds,
      ],
    );
  }

  async createDepartment(
    params: DepartmentInput,
  ) {
    const name = params.name?.trim();

    if (!name) {
      throw new BadRequestException(
        'Department name is required',
      );
    }

    const existing = await this.db.query(
      `
      SELECT id
      FROM departments
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
      `,
      [name],
    );

    if (existing.rowCount) {
      throw new ConflictException(
        'A department with this name already exists',
      );
    }

    const result = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
    }>(
      `
      INSERT INTO departments (
        name,
        description
      )
      VALUES ($1, $2)
      RETURNING
        id,
        name,
        description
      `,
      [
        name,
        params.description?.trim() ||
          null,
      ],
    );

    const department =
      result.rows[0];

    await this.syncDepartmentRoles(
      department.id,
      params.roleIds ?? [],
    );

    return department;
  }

  async updateDepartment(
    id: string,
    params: DepartmentInput,
  ) {
    const existing =
      await this.db.query<{
        id: string;
        name: string;
      }>(
        `
        SELECT id, name
        FROM departments
        WHERE id = $1
        LIMIT 1
        `,
        [id],
      );

    if (!existing.rowCount) {
      throw new NotFoundException(
        'Department not found',
      );
    }

    if (params.name?.trim()) {
      const duplicate =
        await this.db.query(
          `
          SELECT id
          FROM departments
          WHERE LOWER(name) = LOWER($1)
            AND id <> $2
          LIMIT 1
          `,
          [
            params.name.trim(),
            id,
          ],
        );

      if (duplicate.rowCount) {
        throw new ConflictException(
          'A department with this name already exists',
        );
      }
    }

    const result =
      await this.db.query(
        `
        UPDATE departments
        SET
          name = COALESCE($2, name),
          description = CASE
            WHEN $3::boolean = FALSE
              THEN description
            ELSE $4
          END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          params.name?.trim() || null,
          params.description !== undefined,
          params.description === undefined
            ? null
            : params.description.trim() ||
              null,
        ],
      );

    if (params.roleIds !== undefined) {
      await this.syncDepartmentRoles(
        id,
        params.roleIds,
      );
    }

    return result.rows[0];
  }

  async deleteDepartment(
    id: string,
  ) {
    const dependencies =
      await this.db.query<{
        staff_count: number;
        team_count: number;
      }>(
        `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM users
            WHERE department_id = $1
          ) AS staff_count,

          (
            SELECT COUNT(*)::int
            FROM teams
            WHERE department_id = $1
          ) AS team_count
        `,
        [id],
      );

    const counts =
      dependencies.rows[0];

    if (
      counts.staff_count > 0 ||
      counts.team_count > 0
    ) {
      throw new ConflictException(
        'Department cannot be deleted while it still contains staff or teams',
      );
    }

    const result =
      await this.db.query(
        `
        DELETE FROM departments
        WHERE id = $1
        RETURNING id
        `,
        [id],
      );

    if (!result.rowCount) {
      throw new NotFoundException(
        'Department not found',
      );
    }

    return { id };
  }

  async getTeams() {
    const result = await this.db.query(
      `
      SELECT
        t.id,
        t.name,
        t.description,
        t.department_id,
        t.manager_id,
        t.created_at,
        t.updated_at,

        d.name AS department_name,

        CASE
          WHEN u.id IS NULL
            THEN NULL
          ELSE CONCAT(
            u.first_name,
            ' ',
            u.last_name
          )
        END AS manager_name,

        COUNT(
          DISTINCT tm.user_id
        )::int AS member_count

      FROM teams t

      JOIN departments d
        ON d.id = t.department_id

      LEFT JOIN users u
        ON u.id = t.manager_id

      LEFT JOIN team_members tm
        ON tm.team_id = t.id

      GROUP BY
        t.id,
        d.id,
        u.id

      ORDER BY
        d.name ASC,
        t.name ASC
      `,
    );

    return result.rows;
  }

  async createTeam(
    params: TeamInput,
  ) {
    const name = params.name?.trim();

    if (!name) {
      throw new BadRequestException(
        'Team name is required',
      );
    }

    if (!params.departmentId) {
      throw new BadRequestException(
        'Department is required',
      );
    }

    const department =
      await this.db.query(
        `
        SELECT id
        FROM departments
        WHERE id = $1
        LIMIT 1
        `,
        [params.departmentId],
      );

    if (!department.rowCount) {
      throw new BadRequestException(
        'Invalid department',
      );
    }

    const duplicate =
      await this.db.query(
        `
        SELECT id
        FROM teams
        WHERE department_id = $1
          AND LOWER(name) =
            LOWER($2)
        LIMIT 1
        `,
        [
          params.departmentId,
          name,
        ],
      );

    if (duplicate.rowCount) {
      throw new ConflictException(
        'A team with this name already exists in the department',
      );
    }

    if (params.managerId) {
      const manager =
        await this.db.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [params.managerId],
        );

      if (!manager.rowCount) {
        throw new BadRequestException(
          'Invalid team manager',
        );
      }
    }

    const result =
      await this.db.query(
        `
        INSERT INTO teams (
          name,
          description,
          department_id,
          manager_id
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [
          name,
          params.description?.trim() ||
            null,
          params.departmentId,
          params.managerId || null,
        ],
      );

    return result.rows[0];
  }

  async updateTeam(
    id: string,
    params: TeamInput,
  ) {
    const existing =
      await this.db.query<{
        id: string;
        department_id: string;
      }>(
        `
        SELECT
          id,
          department_id
        FROM teams
        WHERE id = $1
        LIMIT 1
        `,
        [id],
      );

    if (!existing.rowCount) {
      throw new NotFoundException(
        'Team not found',
      );
    }

    const departmentId =
      params.departmentId ??
      existing.rows[0].department_id;

    if (params.departmentId) {
      const department =
        await this.db.query(
          `
          SELECT id
          FROM departments
          WHERE id = $1
          LIMIT 1
          `,
          [params.departmentId],
        );

      if (!department.rowCount) {
        throw new BadRequestException(
          'Invalid department',
        );
      }
    }

    if (params.name?.trim()) {
      const duplicate =
        await this.db.query(
          `
          SELECT id
          FROM teams
          WHERE department_id = $1
            AND LOWER(name) =
              LOWER($2)
            AND id <> $3
          LIMIT 1
          `,
          [
            departmentId,
            params.name.trim(),
            id,
          ],
        );

      if (duplicate.rowCount) {
        throw new ConflictException(
          'A team with this name already exists in the department',
        );
      }
    }

    if (params.managerId) {
      const manager =
        await this.db.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [params.managerId],
        );

      if (!manager.rowCount) {
        throw new BadRequestException(
          'Invalid team manager',
        );
      }
    }

    const result =
      await this.db.query(
        `
        UPDATE teams
        SET
          name =
            COALESCE($2, name),

          description = CASE
            WHEN $3::boolean = FALSE
              THEN description
            ELSE $4
          END,

          department_id =
            COALESCE(
              $5::uuid,
              department_id
            ),

          manager_id = CASE
            WHEN $6::boolean = FALSE
              THEN manager_id
            ELSE $7::uuid
          END,

          updated_at = NOW()

        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          params.name?.trim() ||
            null,
          params.description !== undefined,
          params.description === undefined
            ? null
            : params.description.trim() ||
              null,
          params.departmentId || null,
          params.managerId !== undefined,
          params.managerId ?? null,
        ],
      );

    return result.rows[0];
  }

  async deleteTeam(
    id: string,
  ) {
    const members =
      await this.db.query<{
        count: number;
      }>(
        `
        SELECT COUNT(*)::int AS count
        FROM team_members
        WHERE team_id = $1
        `,
        [id],
      );

    if (
      Number(
        members.rows[0]?.count ?? 0,
      ) > 0
    ) {
      throw new ConflictException(
        'Team cannot be deleted while staff members are assigned to it',
      );
    }

    const result =
      await this.db.query(
        `
        DELETE FROM teams
        WHERE id = $1
        RETURNING id
        `,
        [id],
      );

    if (!result.rowCount) {
      throw new NotFoundException(
        'Team not found',
      );
    }

    return { id };
  }
}
