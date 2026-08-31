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
import {
  type ContactMethodInput,
  type ContactInput,
} from './contacts.repository.js';
import { ContactsService } from './contacts.service.js';

@Controller('admin/contacts')
@UseGuards(AuthGuard, PermissionGuard)
export class ContactsController {
  constructor(
    private readonly contacts:
      ContactsService,
  ) {}

  @Get()
  @RequirePermission('contacts.read.all')
  async listAll() {
    return {
      success: true,
      data: await this.contacts.listAll(),
    };
  }

  @Get('organization/:organizationId')
  @RequirePermission('contacts.read.all')
  async listForOrganization(
    @Param('organizationId')
    organizationId: string,
  ) {
    return {
      success: true,
      data:
        await this.contacts.listByOrganization(
          organizationId,
        ),
    };
  }

  @Post()
  @RequirePermission('contacts.create')
  async create(
    @Body() body: Partial<ContactInput>,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.contacts.create(
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Get(':contactId/methods')
  @RequirePermission('contacts.read.all')
  async listMethods(@Param('contactId') contactId: string) {
    return { success: true, data: await this.contacts.listMethods(contactId) };
  }

  @Post(':contactId/methods')
  @RequirePermission('contacts.create')
  async createMethod(
    @Param('contactId') contactId: string,
    @Body() body: Partial<ContactMethodInput>,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return { success: true, data: await this.contacts.createMethod(contactId, body, this.context(request, userAgent)) };
  }

  @Patch(':contactId/methods/:methodId')
  @RequirePermission('contacts.update.all')
  async updateMethod(
    @Param('contactId') contactId: string,
    @Param('methodId') methodId: string,
    @Body() body: Partial<ContactMethodInput>,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return { success: true, data: await this.contacts.updateMethod(contactId, methodId, body, this.context(request, userAgent)) };
  }

  @Delete(':contactId/methods/:methodId')
  @RequirePermission('contacts.delete')
  async deleteMethod(
    @Param('contactId') contactId: string,
    @Param('methodId') methodId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return { success: true, data: await this.contacts.deleteMethod(contactId, methodId, this.context(request, userAgent)) };
  }

  @Patch(':id')
  @RequirePermission('contacts.update.all')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<ContactInput>,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.contacts.update(
        id,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Delete(':id')
  @RequirePermission('contacts.delete')
  async delete(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.contacts.delete(
        id,
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
