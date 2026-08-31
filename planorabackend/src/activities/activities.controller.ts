import {
  Body,
  Controller,
  Delete,
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
import { type ActivityInput } from './activities.repository.js';
import { ActivitiesService } from './activities.service.js';

@Controller('admin/activities')
@UseGuards(AuthGuard, PermissionGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermission('activities.read.all')
  async list() {
    return { success: true, data: await this.activities.list() };
  }

  @Get(':id')
  @RequirePermission('activities.read.all')
  async get(@Param('id') id: string) {
    return { success: true, data: await this.activities.get(id) };
  }

  @Post()
  @RequirePermission('activities.create')
  async create(
    @Body() body: Partial<ActivityInput>,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.activities.create(body, this.ctx(req, ua)),
    };
  }

  @Patch(':id')
  @RequirePermission('activities.update.all')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<ActivityInput>,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.activities.update(id, body, this.ctx(req, ua)),
    };
  }

  @Delete(':id')
  @RequirePermission('activities.delete')
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.activities.remove(id, this.ctx(req, ua)),
    };
  }

  private ctx(req: AuthenticatedRequest, ua?: string) {
    return {
      actorUserId: req.user!.id,
      ipAddress: req.ip,
      userAgent: ua,
    };
  }
}

@Controller('admin/leads')
@UseGuards(AuthGuard, PermissionGuard)
export class LeadActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get(':leadId/activities')
  // R3 is an admin workspace. A future staff route must enforce staff-scoped
  // ownership permissions and must not grant unrestricted activities.read.all.
  @RequirePermission('activities.read.all')
  async listForLead(@Param('leadId') leadId: string) {
    return { success: true, data: await this.activities.listForLead(leadId) };
  }
}
