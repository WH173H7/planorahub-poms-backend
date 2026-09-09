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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import {
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PursuitWorkflowsService } from './pursuit-workflows.service.js';

@Controller('admin')
@UseGuards(AuthGuard, PermissionGuard)
export class PursuitWorkflowsController {
  constructor(
    private service: PursuitWorkflowsService,
  ) {}

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

  // ============================================================
  // WORKFLOW TEMPLATES
  // ============================================================

  @Get('pursuit-workflows')
  @RequirePermission('leads.read.all')
  async list() {
    return {
      success: true,
      data: await this.service.list(),
    };
  }

  @Post('pursuit-workflows')
  @RequirePermission('leads.update.all')
  async create(
    @Body() body: any,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.create(
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Patch('pursuit-workflows/:id')
  @RequirePermission('leads.update.all')
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.update(
        id,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Post('pursuit-workflows/:id/default')
  @RequirePermission('leads.update.all')
  async setDefault(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.setDefault(
        id,
        this.context(request, userAgent),
      ),
    };
  }

  @Delete('pursuit-workflows/:id')
  @RequirePermission('leads.update.all')
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.remove(
        id,
        this.context(request, userAgent),
      ),
    };
  }

  // ============================================================
  // ADMIN PURSUIT MONITORING / REVIEW
  // ============================================================

  @Get('leads/:leadId/pursuit')
  @RequirePermission('leads.read.all')
  async pursuit(
    @Param('leadId') leadId: string,
  ) {
    return {
      success: true,
      data: await this.service.getLeadPursuit(
        leadId,
      ),
    };
  }

  // Kept for compatibility/emergency administration.
  @Patch('leads/:leadId/pursuit/steps/:stepId')
  @RequirePermission('leads.update.all')
  async step(
    @Param('leadId') leadId: string,
    @Param('stepId') stepId: string,
    @Body() body: any,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.updateStep(
        leadId,
        stepId,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Post(
    'leads/:leadId/pursuit/steps/:stepId/evidence',
  )
  @RequirePermission('leads.update.all')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  async evidence(
    @Param('leadId') leadId: string,
    @Param('stepId') stepId: string,
    @UploadedFile() file: any,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.evidence(
        leadId,
        stepId,
        file,
        this.context(request, userAgent),
      ),
    };
  }

  @Post(
    'leads/:leadId/pursuit/steps/:stepId/comments',
  )
  @RequirePermission('leads.update.all')
  async comment(
    @Param('leadId') leadId: string,
    @Param('stepId') stepId: string,
    @Body() body: any,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.comment(
        leadId,
        stepId,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Post(
    'leads/:leadId/pursuit/steps/:stepId/review',
  )
  @RequirePermission('leads.update.all')
  async review(
    @Param('leadId') leadId: string,
    @Param('stepId') stepId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.markReviewed(
        leadId,
        stepId,
        this.context(request, userAgent),
      ),
    };
  }

  @Post(
    'leads/:leadId/pursuit/steps/:stepId/retake',
  )
  @RequirePermission('leads.update.all')
  async retake(
    @Param('leadId') leadId: string,
    @Param('stepId') stepId: string,
    @Body() body: any,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.requestRetake(
        leadId,
        stepId,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Post('leads/:leadId/pursuit/custom-steps')
  @RequirePermission('leads.update.all')
  async adminRequiredStep(
    @Param('leadId') leadId: string,
    @Body() body: any,
    @Req() request: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.service.addCustomStep(
        leadId,
        body,
        'ADMIN_REQUIRED',
        this.context(request, userAgent),
      ),
    };
  }
}
