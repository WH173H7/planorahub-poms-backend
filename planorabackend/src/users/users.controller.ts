import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { type UpdateStaffInput, UsersService } from './users.service.js';

@Controller('admin/staff')
@UseGuards(AuthGuard, PermissionGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users.read.all')
  async listStaff() { return { success: true, data: await this.usersService.listStaff() }; }

  @Get(':id')
  @RequirePermission('users.read.all')
  async getStaff(@Param('id') id: string) { return { success: true, data: await this.usersService.getStaff(id) }; }

  @Post()
  @RequirePermission('users.create')
  async createStaff(@Body() dto: CreateStaffDto, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, message: 'Staff account created successfully', data: await this.usersService.createStaff(dto, this.ctx(req, ua)) };
  }

  @Patch(':id')
  @RequirePermission('users.update.all')
  async updateStaff(@Param('id') id: string, @Body() body: UpdateStaffInput, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, message: 'Staff account updated successfully', data: await this.usersService.updateStaff(id, body, this.ctx(req, ua)) };
  }

  @Post(':id/suspend')
  @RequirePermission('users.suspend')
  async suspendStaff(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, message: 'Staff account suspended', data: await this.usersService.setStaffStatus(id, 'SUSPENDED', this.ctx(req, ua)) };
  }

  @Post(':id/disable')
  @RequirePermission('users.disable')
  async disableStaff(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, message: 'Staff account disabled', data: await this.usersService.setStaffStatus(id, 'DISABLED', this.ctx(req, ua)) };
  }

  @Post(':id/reactivate')
  @RequirePermission('users.update.all')
  async reactivateStaff(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, message: 'Staff account reactivated', data: await this.usersService.setStaffStatus(id, 'ACTIVE', this.ctx(req, ua)) };
  }

  @Delete(':id')
  @RequirePermission('users.disable')
  async deleteStaff(
    @Param('id') id: string,
    @Body() body: { reassignToId?: string | null } | undefined,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return { success: true, message: 'Staff account deleted', data: await this.usersService.deleteStaff(id, body?.reassignToId ?? null, this.ctx(req, ua)) };
  }

  @Post(':id/reset-password')
  @RequirePermission('users.reset_password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { sendEmail?: boolean },
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      message: 'Temporary password generated',
      data: await this.usersService.resetPassword(id, body.sendEmail !== false, this.ctx(req, ua)),
    };
  }

  private ctx(req: AuthenticatedRequest, userAgent?: string) {
    return { actorUserId: req.user!.id, ipAddress: req.ip, userAgent };
  }
}
