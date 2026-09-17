import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { TeamActivityService } from './team-activity.service.js';

@Controller('admin/team-activity')
@UseGuards(AuthGuard, PermissionGuard)
export class TeamActivityController {
  constructor(private readonly teamActivity: TeamActivityService) {}

  @Get()
  @RequirePermission('activities.read.all')
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('staffId') staffId?: string,
    @Query('type') type?: string,
    @Query('leadId') leadId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('reviewed') reviewed?: string,
  ) {
    return {
      success: true,
      data: await this.teamActivity.list({
        search,
        staffId,
        type,
        leadId,
        organizationId,
        from,
        to,
        reviewed,
        reviewerUserId: request.user!.id,
      }),
    };
  }

  @Get(':id')
  @RequirePermission('activities.read.all')
  async detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return {
      success: true,
      data: await this.teamActivity.detail(id, request.user!.id),
    };
  }

  @Patch(':id/review')
  @RequirePermission('activities.read.all')
  async review(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { reviewed?: boolean; response?: string | null },
  ) {
    return {
      success: true,
      data: await this.teamActivity.setReview(id, request.user!.id, {
        reviewed: body.reviewed,
        response: body.response,
      }),
    };
  }
}
