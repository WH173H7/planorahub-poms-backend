import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
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

import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UsersService } from './users.service.js';

@Controller('admin/staff')
@UseGuards(AuthGuard, PermissionGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @RequirePermission('users.read.all')
  async listStaff() {
    return {
      success: true,
      data: await this.usersService.listStaff(),
    };
  }

  @Get(':id')
  @RequirePermission('users.read.all')
  async getStaff(
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.usersService.getStaff(id),
    };
  }

  @Post()
  @RequirePermission('users.create')
  async createStaff(
    @Body() dto: CreateStaffDto,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result =
      await this.usersService.createStaff(
        dto,
        {
          actorUserId: request.user!.id,
          ipAddress: request.ip,
          userAgent,
        },
      );

    return {
      success: true,
      message:
        'Staff account created successfully',
      data: result,
    };
  }
}