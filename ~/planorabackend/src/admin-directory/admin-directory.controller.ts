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

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { AdminDirectoryService } from './admin-directory.service.js';

@Controller('admin')
@UseGuards(
  AuthGuard,
  PermissionGuard,
)
export class AdminDirectoryController {
  constructor(
    private readonly directory:
      AdminDirectoryService,
  ) {}

  @Get('roles')
  @RequirePermission('users.create')
  async roles() {
    return {
      success: true,
      data:
        await this.directory.getRoles(),
    };
  }

  @Post('roles')
  @RequirePermission('roles.manage')
  async createRole(
    @Body()
    body: {
      name: string;
      description?: string;
      permissionIds?: string[];
    },
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.directory.createRole(body, this.ctx(req, ua)),
    };
  }

  @Get('roles/:id/overview')
  @RequirePermission('roles.manage')
  async roleOverview(
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.directory.getRoleOverview(id),
    };
  }

  @Delete('roles/:id')
  @RequirePermission('roles.manage')
  async deleteRole(
    @Param('id') id: string,
    @Body() body: { reassignRoleId?: string | null },
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.directory.deleteRole(id, body?.reassignRoleId || null, this.ctx(req, ua)),
    };
  }

  @Patch('roles/:id')
  @RequirePermission('roles.manage')
  async updateRole(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      permissionIds?: string[];
      isActive?: boolean;
    },
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.directory.updateRole(id, body, this.ctx(req, ua)),
    };
  }

  @Get('permissions')
  @RequirePermission('users.create')
  async permissions() {
    return {
      success: true,
      data:
        await this.directory
          .getPermissions(),
    };
  }

  @Get('departments')
  @RequirePermission('users.create')
  async departments() {
    return {
      success: true,
      data:
        await this.directory
          .getDepartments(),
    };
  }

  @Post('departments')
  @RequirePermission('users.create')
  async createDepartment(
    @Body()
    body: {
      name: string;
      description?: string;
      roleIds?: string[];
    },
  ) {
    return {
      success: true,
      data:
        await this.directory
          .createDepartment(body),
    };
  }

  @Patch('departments/:id')
  @RequirePermission('users.create')
  async updateDepartment(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      roleIds?: string[];
    },
  ) {
    return {
      success: true,
      data:
        await this.directory
          .updateDepartment(
            id,
            body,
          ),
    };
  }

  @Delete('departments/:id')
  @RequirePermission('users.create')
  async deleteDepartment(
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data:
        await this.directory
          .deleteDepartment(id),
    };
  }

  @Get('teams')
  @RequirePermission('users.create')
  async teams() {
    return {
      success: true,
      data:
        await this.directory
          .getTeams(),
    };
  }

  @Post('teams')
  @RequirePermission('users.create')
  async createTeam(
    @Body()
    body: {
      name: string;
      description?: string;
      departmentId: string;
      managerId?: string;
    },
  ) {
    return {
      success: true,
      data:
        await this.directory
          .createTeam(body),
    };
  }

  @Patch('teams/:id')
  @RequirePermission('users.create')
  async updateTeam(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      departmentId?: string;
      managerId?: string | null;
    },
  ) {
    return {
      success: true,
      data:
        await this.directory
          .updateTeam(
            id,
            body,
          ),
    };
  }

  @Delete('teams/:id')
  @RequirePermission('users.create')
  async deleteTeam(
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data:
        await this.directory
          .deleteTeam(id),
    };
  }
  private ctx(req: AuthenticatedRequest, userAgent?: string) {
    return { actorUserId: req.user!.id, ipAddress: req.ip, userAgent };
  }

}
