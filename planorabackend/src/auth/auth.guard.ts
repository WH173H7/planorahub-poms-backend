import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SupabaseService } from '../supabase/supabase.service.js';
import { DatabaseService } from '../database/database.service.js';
import { ALLOW_PASSWORD_CHANGE_PENDING } from './allow-password-change-pending.decorator.js';

export type AuthenticatedUser = {
  id: string;
  authUserId: string;
  email: string;
  roleId: string;
  roleCode: string;
  status: string;
  mustChangePassword: boolean;
};

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly db: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const { data, error } = await this.supabase.admin.auth.getClaims(token);

    if (error || !data?.claims?.sub) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const authUserId = data.claims.sub;
    const result = await this.db.query<{
      id: string;
      auth_user_id: string;
      email: string;
      role_id: string;
      role_code: string;
      status: string;
      must_change_password: boolean;
    }>(
      `
      SELECT
        u.id,
        u.auth_user_id,
        u.email,
        u.role_id,
        r.code AS role_code,
        u.status,
        u.must_change_password
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.auth_user_id = $1
      LIMIT 1
      `,
      [authUserId],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('No POMS account is linked to this login');
    }

    if (user.status === 'SUSPENDED' || user.status === 'DISABLED') {
      throw new UnauthorizedException('Account is not active');
    }

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_PENDING,
      [context.getHandler(), context.getClass()],
    );

    if (user.must_change_password && !allowPending) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your temporary password before using PlanoraHub CRM.',
      });
    }

    request.user = {
      id: user.id,
      authUserId: user.auth_user_id,
      email: user.email,
      roleId: user.role_id,
      roleCode: user.role_code,
      status: user.status,
      mustChangePassword: user.must_change_password,
    };

    return true;
  }
}
