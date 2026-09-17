import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
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
}
