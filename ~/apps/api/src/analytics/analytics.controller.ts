import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('admin/analytics')
@UseGuards(AuthGuard, PermissionGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermission('analytics.read.all')
  async overview(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return {
      success: true,
      data: await this.analytics.overview(from, to),
    };
  }
}
