import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  AuthGuard,
  type AuthenticatedRequest,
} from './auth.guard.js';

import { DatabaseService } from '../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';

type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  status: string;
  must_change_password: boolean;
  role_id: string;
  role_code: string;
  role_name: string;
  department_id: string | null;
  department_name: string | null;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  async me(
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user!.id;

    const result =
      await this.db.query<ProfileRow>(
        `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.job_title,
          u.status,
          u.must_change_password,

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

        WHERE u.id = $1
        LIMIT 1
        `,
        [userId],
      );

    const profile = result.rows[0];

    const permissions =
      await this.permissions
        .getEffectivePermissions(userId);

    return {
      success: true,
      data: {
        ...profile,
        permissions,
      },
    };
  }
}