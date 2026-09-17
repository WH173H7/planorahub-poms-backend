import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CrmMailService } from './crm-mail.service.js';

@Controller('mail')
export class CrmMailController {
  constructor(private readonly service: CrmMailService) {}

  @Get('summary')
  @UseGuards(AuthGuard)
  summary(@Req() request: AuthenticatedRequest) { return this.wrap(this.service.summary(this.actor(request))); }

  @Get('threads')
  @UseGuards(AuthGuard)
  threads(@Req() request: AuthenticatedRequest, @Query('box') box?: string, @Query('q') q?: string) {
    return this.wrap(this.service.threads(this.actor(request), box || 'all', q || ''));
  }

  @Get('threads/:id')
  @UseGuards(AuthGuard)
  thread(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.wrap(this.service.thread(this.actor(request), id)); }

  @Post('send')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('mail.send')
  @UseInterceptors(FilesInterceptor('attachments', 5, { limits: { fileSize: 10 * 1024 * 1024 } }))
  send(@Req() request: AuthenticatedRequest, @Body() body: any, @UploadedFiles() files: any[] = [], @Headers('user-agent') userAgent?: string) {
    return this.wrap(this.service.send(this.actor(request), body, files, this.ctx(request, userAgent)));
  }

  @Post('threads/:id/reply')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('mail.send')
  @UseInterceptors(FilesInterceptor('attachments', 5, { limits: { fileSize: 10 * 1024 * 1024 } }))
  reply(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any, @UploadedFiles() files: any[] = [], @Headers('user-agent') userAgent?: string) {
    return this.wrap(this.service.reply(this.actor(request), id, body, files, this.ctx(request, userAgent)));
  }

  @Patch('threads/:id/access')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('mail.manage')
  access(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: { userIds?: string[] }, @Headers('user-agent') userAgent?: string) {
    return this.wrap(this.service.grantAccess(this.actor(request), id, body.userIds || [], this.ctx(request, userAgent)));
  }


  @Get('drafts')
  @UseGuards(AuthGuard)
  drafts(@Req() request: AuthenticatedRequest) { return this.wrap(this.service.drafts(this.actor(request))); }

  @Post('drafts')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('mail.send')
  saveDraft(@Req() request: AuthenticatedRequest, @Body() body: any, @Headers('user-agent') userAgent?: string) { return this.wrap(this.service.saveDraft(this.actor(request), null, body, this.ctx(request, userAgent))); }

  @Patch('drafts/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('mail.send')
  updateDraft(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any, @Headers('user-agent') userAgent?: string) { return this.wrap(this.service.saveDraft(this.actor(request), id, body, this.ctx(request, userAgent))); }

  @Post('drafts/:id/delete')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('mail.send')
  deleteDraft(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('user-agent') userAgent?: string) { return this.wrap(this.service.deleteDraft(this.actor(request), id, this.ctx(request, userAgent))); }

  @Get('templates')
  @UseGuards(AuthGuard)
  templates(@Req() request: AuthenticatedRequest) { return this.wrap(this.service.templates(this.actor(request))); }

  @Post('templates')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('mail.templates.manage')
  createTemplate(@Req() request: AuthenticatedRequest, @Body() body: any, @Headers('user-agent') userAgent?: string) { return this.wrap(this.service.createTemplate(this.actor(request), body, this.ctx(request, userAgent))); }

  @Patch('templates/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('mail.templates.manage')
  updateTemplate(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: any, @Headers('user-agent') userAgent?: string) { return this.wrap(this.service.updateTemplate(this.actor(request), id, body, this.ctx(request, userAgent))); }

  @Get('attachments/:id')
  @UseGuards(AuthGuard)
  attachment(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Headers('user-agent') userAgent?: string) { return this.wrap(this.service.attachment(this.actor(request), id, this.ctx(request, userAgent))); }

  @Post('webhooks/resend')
  webhook(@Query('token') token: string | undefined, @Body() body: any) { return this.wrap(this.service.handleResendWebhook(token, body)); }

  private actor(request: AuthenticatedRequest) {
    return { id: request.user!.id, roleCode: request.user!.roleCode, email: request.user!.email };
  }
  private ctx(request: AuthenticatedRequest, userAgent?: string) { return { actorUserId: request.user!.id, ipAddress: request.ip, userAgent }; }
  private async wrap<T>(value: Promise<T>) { return { success: true, data: await value }; }
}
