import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import {
  type OrganizationInput,
  type OrganizationStatus,
} from './organizations.repository.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('admin/organizations')
@UseGuards(AuthGuard, PermissionGuard)
export class OrganizationsController {
  constructor(
    private readonly organizations:
      OrganizationsService,
  ) {}

  @Get()
  @RequirePermission('organizations.read.all')
  async list() {
    return {
      success: true,
      data: await this.organizations.list(),
    };
  }

  @Get(':id')
  @RequirePermission('organizations.read.all')
  async get(
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.organizations.get(id),
    };
  }

  @Post()
  @RequirePermission('organizations.create')
  async create(
    @Body() body: Partial<OrganizationInput>,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      message: 'Organization created',
      data: await this.organizations.create(
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Patch(':id')
  @RequirePermission('organizations.update.all')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<OrganizationInput>,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      message: 'Organization updated',
      data: await this.organizations.update(
        id,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Post(':id/status')
  @RequirePermission('organizations.archive')
  async setStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: OrganizationStatus;
    },
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.organizations.setStatus(
        id,
        body.status,
        this.context(request, userAgent),
      ),
    };
  }

  private context(
    request: AuthenticatedRequest,
    userAgent?: string,
  ) {
    return {
      actorUserId: request.user!.id,
      ipAddress: request.ip,
      userAgent,
    };
  }
}
