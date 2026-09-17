import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { AllowPasswordChangePending } from './allow-password-change-pending.decorator.js';
import { DatabaseService } from '../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { AuditService } from '../audit/audit.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  @AllowPasswordChangePending()
  async me(@Req() request: AuthenticatedRequest) {
    const userId = request.user!.id;

    const result = await this.db.query(
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
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id = $1
        LIMIT 1
      `,
      [userId],
    );

    const profile = result.rows[0];
    const permissions = await this.permissions.getEffectivePermissions(userId);

    return { success: true, data: { ...profile, permissions } };
  }

  @Post('session-open')
  @UseGuards(AuthGuard)
  @AllowPasswordChangePending()
  async sessionOpen(@Req() request: AuthenticatedRequest) {
    const userId = request.user!.id;
    const previousLogin = (await this.db.query<{ last_login_at: string | null }>(
      `SELECT last_login_at FROM users WHERE id=$1 LIMIT 1`,
      [userId],
    )).rows[0]?.last_login_at ?? null;

    await this.db.query(
      `UPDATE users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1`,
      [userId],
    );

    await this.audit.log({
      actorUserId: userId,
      action: 'CRM_SESSION_OPENED',
      module: 'auth',
      entityType: 'user_session',
      entityId: userId,
      newValues: { previousLoginAt: previousLogin },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { success: true, data: true };
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @AllowPasswordChangePending()
  async logout(@Req() request: AuthenticatedRequest) {
    const userId = request.user!.id;
    await this.audit.log({
      actorUserId: userId,
      action: 'CRM_SESSION_CLOSED',
      module: 'auth',
      entityType: 'user_session',
      entityId: userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return { success: true, data: true };
  }

  @Post('password-changed')
  @UseGuards(AuthGuard)
  @AllowPasswordChangePending()
  async passwordChanged(@Req() request: AuthenticatedRequest) {
    const userId = request.user!.id;

    await this.db.query(
      `UPDATE users
       SET must_change_password=FALSE,
           password_changed_at=NOW(),
           status=CASE WHEN status='INVITED' THEN 'ACTIVE' ELSE status END,
           updated_at=NOW()
       WHERE id=$1`,
      [userId],
    );

    await this.audit.log({
      actorUserId: userId,
      action: 'PASSWORD_CHANGED',
      module: 'auth',
      entityType: 'user',
      entityId: userId,
      newValues: { mustChangePassword: false },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { success: true, message: 'Password updated. Your PlanoraHub workspace is ready.' };
  }
}
