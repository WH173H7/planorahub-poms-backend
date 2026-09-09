import { Body, Controller, Get, Headers, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import type { TaskInput } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';
type UploadedTaskFile={originalname:string;mimetype:string;size:number;buffer:Buffer};
@Controller('staff/tasks')
@UseGuards(AuthGuard)
export class StaffTasksController {
  constructor(private readonly tasks: TasksService) {}
  @Get() async list(@Req() request: AuthenticatedRequest) { return { success: true, data: await this.tasks.listOwned(request.user!.id) }; }
  @Get(':id') async get(@Param('id') id:string,@Req() request:AuthenticatedRequest){return {success:true,data:await this.tasks.getOwned(id,request.user!.id)};}
  @Patch(':id') async update(@Param('id') id:string,@Body() body:Partial<TaskInput>,@Req() request:AuthenticatedRequest,@Headers('user-agent') userAgent?:string){return {success:true,data:await this.tasks.updateOwned(id,body,request.user!.id,{actorUserId:request.user!.id,ipAddress:request.ip,userAgent})};}
  @Post(':id/accept') async accept(@Param('id') id:string,@Req() request:AuthenticatedRequest,@Headers('user-agent') userAgent?:string){await this.tasks.getOwned(id,request.user!.id);return {success:true,data:await this.tasks.accept(id,{actorUserId:request.user!.id,ipAddress:request.ip,userAgent})};}
  @Post(':id/start') async start(@Param('id') id:string,@Req() request:AuthenticatedRequest,@Headers('user-agent') userAgent?:string){await this.tasks.getOwned(id,request.user!.id);return {success:true,data:await this.tasks.start(id,{actorUserId:request.user!.id,ipAddress:request.ip,userAgent})};}
  @Post(':id/submit') async submit(@Param('id') id:string,@Req() request:AuthenticatedRequest,@Headers('user-agent') userAgent?:string){await this.tasks.getOwned(id,request.user!.id);return {success:true,data:await this.tasks.submitForReview(id,{actorUserId:request.user!.id,ipAddress:request.ip,userAgent})};}
  @Post(':id/comments') async comment(@Param('id') id:string,@Body() body:{message:string;parentEventId?:string|null},@Req() request:AuthenticatedRequest,@Headers('user-agent') userAgent?:string){await this.tasks.getOwned(id,request.user!.id);return {success:true,data:await this.tasks.comment(id,body.message,body.parentEventId??null,{actorUserId:request.user!.id,ipAddress:request.ip,userAgent})};}
  @Post(':id/attachments') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024,files:1}})) async upload(@Param('id') id:string,@UploadedFile() file:UploadedTaskFile,@Req() request:AuthenticatedRequest,@Headers('user-agent') userAgent?:string){await this.tasks.getOwned(id,request.user!.id);return {success:true,data:await this.tasks.uploadAttachment(id,file,{actorUserId:request.user!.id,ipAddress:request.ip,userAgent})};}
  @Post(':id/workflow-steps/:stepId') async toggleWorkflowStep(@Param('id') id:string,@Param('stepId') stepId:string,@Body() body:{completed:boolean},@Req() request:AuthenticatedRequest,@Headers('user-agent') userAgent?:string){await this.tasks.getOwned(id,request.user!.id);return {success:true,data:await this.tasks.toggleWorkflowStep(id,stepId,Boolean(body.completed),{actorUserId:request.user!.id,ipAddress:request.ip,userAgent})};}
    @Post('lead/:leadId') async createForLead(@Param('leadId') leadId:string,@Body() body:Partial<TaskInput>,@Req() request:AuthenticatedRequest,@Headers('user-agent') userAgent?:string){return {success:true,data:await this.tasks.createOwnedForLead(leadId,body,request.user!.id,{actorUserId:request.user!.id,ipAddress:request.ip,userAgent})};}
}
