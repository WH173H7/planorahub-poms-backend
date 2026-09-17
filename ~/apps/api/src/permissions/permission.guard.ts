import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  REQUIRED_PERMISSION,
} from '../auth/require-permission.decorator.js';

import type {
  AuthenticatedRequest,
} from '../auth/auth.guard.js';

import { PermissionsService } from './permissions.service.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const requiredPermission =
      this.reflector.getAllAndOverride<string>(
        REQUIRED_PERMISSION,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (!requiredPermission) {
      return true;
    }

    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new ForbiddenException(
        'Authenticated user was not found',
      );
    }

    const allowed =
      await this.permissions.hasPermission(
        request.user.id,
        requiredPermission,
      );

    if (!allowed) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}