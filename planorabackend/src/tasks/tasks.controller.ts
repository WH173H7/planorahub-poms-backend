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
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PermissionGuard } from '../permissions/permission.guard.js';

import { type TaskInput } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

type UploadedTaskFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('admin/tasks')
@UseGuards(AuthGuard, PermissionGuard)
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
  ) {}

  @Get()
  @RequirePermission('tasks.read.all')
  async list() {
    return {
      success: true,
      data: await this.tasks.list(),
    };
  }

  @Get(':id')
  @RequirePermission('tasks.read.all')
  async get(
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.tasks.get(id),
    };
  }

  @Post()
  @RequirePermission('tasks.create')
  async create(
    @Body() body: Partial<TaskInput>,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.tasks.create(
        body,
        this.ctx(req, ua),
      ),
    };
  }

  @Patch(':id')
  @RequirePermission('tasks.update.all')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<TaskInput>,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.tasks.update(
        id,
        body,
        this.ctx(req, ua),
      ),
    };
  }

  @Post(':id/accept')
  @RequirePermission('tasks.update.all')
  async accept(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.tasks.accept(
        id,
        this.ctx(req, ua),
      ),
    };
  }

  @Post(':id/start')
  @RequirePermission('tasks.update.all')
  async start(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.tasks.start(
        id,
        this.ctx(req, ua),
      ),
    };
  }

  @Post(':id/control')
  @RequirePermission('tasks.control')
  async control(
    @Param('id') id:string,
    @Body() body:{action:'PAUSE'|'RESUME'|'CANCEL'|'COMPLETE'|'REOPEN'|'DISPATCH_NOW'},
    @Req() req:AuthenticatedRequest,
    @Headers('user-agent') ua?:string,
  ){
    return {success:true,data:await this.tasks.controlTask(id,body.action,this.ctx(req,ua))};
  }

  @Post(':id/review')
  @RequirePermission('tasks.update.all')
  async reviewSubmission(@Param('id') id:string,@Body() body:{decision:'APPROVE'|'REVISION';message?:string},@Req() req:AuthenticatedRequest,@Headers('user-agent') ua?:string){
    return {success:true,data:await this.tasks.reviewSubmission(id,body.decision,body.message,this.ctx(req,ua))};
  }

  @Post(':id/workflow-steps/:stepId')
  @RequirePermission('tasks.update.all')
  async toggleWorkflowStep(@Param('id') id:string,@Param('stepId') stepId:string,@Body() body:{completed:boolean},@Req() req:AuthenticatedRequest,@Headers('user-agent') ua?:string){
    return {success:true,data:await this.tasks.toggleWorkflowStep(id,stepId,Boolean(body.completed),this.ctx(req,ua))};
  }

  @Delete(':id')
  @RequirePermission('tasks.delete')
  async deleteTask(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.tasks.deleteTask(
        id,
        this.ctx(req, ua),
      ),
    };
  }

  @Post(':id/comments')
  @RequirePermission('tasks.comment')
  async comment(
    @Param('id') id: string,
    @Body()
    body: {
      message: string;
      parentEventId?: string | null;
    },
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.tasks.comment(
        id,
        body.message,
        body.parentEventId ?? null,
        this.ctx(req, ua),
      ),
    };
  }

  @Post(':id/attachments')
  @RequirePermission('tasks.attachments.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: UploadedTaskFile,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.tasks.uploadAttachment(
        id,
        file,
        this.ctx(req, ua),
      ),
    };
  }

  @Get(':id/attachments')
  @RequirePermission('tasks.read.all')
  async listAttachments(
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.tasks.listAttachments(id),
    };
  }

  @Get(':id/attachments/:attachmentId/download')
  @RequirePermission('tasks.read.all')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return {
      success: true,
      data: await this.tasks.getAttachmentDownload(
        id,
        attachmentId,
      ),
    };
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermission('tasks.attachments.delete')
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') ua?: string,
  ) {
    return {
      success: true,
      data: await this.tasks.deleteAttachment(
        id,
        attachmentId,
        this.ctx(req, ua),
      ),
    };
  }

  private ctx(
    req: AuthenticatedRequest,
    ua?: string,
  ) {
    return {
      actorUserId: req.user!.id,
      ipAddress: req.ip,
      userAgent: ua,
    };
  }
}
