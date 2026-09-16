import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import type { UploadedTaskFile } from '../tasks/tasks.service.js';
import { type AssignmentInput, type BulkAssignmentInput, type LeadInput, type LeadStage, type OrganizationLeadInput } from './leads.repository.js';
import { LeadsService } from './leads.service.js';

@Controller('admin/leads')
@UseGuards(AuthGuard, PermissionGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}
  @Get() @RequirePermission('leads.read.all') async list(){return{success:true,data:await this.leads.list()};}
  @Post('pool/publish') @RequirePermission('leads.assign') async publishPool(@Body()body:{leadIds?:string[]},@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.publishToPool(body.leadIds??[],this.context(request,ua))};}
  @Post(':id/pool/remove') @RequirePermission('leads.assign') async removePool(@Param('id')id:string,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.removeFromPool(id,this.context(request,ua))};}
  @Post('bulk-assign') @RequirePermission('leads.assign') async bulkAssign(@Body()body:Partial<BulkAssignmentInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.bulkAssign(body,this.context(request,ua))};}
  @Get('assignment-batches/:batchId')
  @RequirePermission('leads.read.all')
  async assignmentBatch(@Param('batchId') batchId: string) {
    return {
      success: true,
      data: await this.leads.getAssignmentBatch(batchId),
    };
  }

  @Get('assignment-batches/:batchId/attachments')
  @RequirePermission('leads.read.all')
  async assignmentAttachments(@Param('batchId') batchId: string) {
    return { success: true, data: await this.leads.listAssignmentAttachments(batchId) };
  }

  @Post('assignment-batches/:batchId/attachments')
  @RequirePermission('leads.assign')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async uploadAssignmentAttachment(@Param('batchId') batchId: string, @UploadedFile() file: UploadedTaskFile, @Req() request: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.leads.uploadAssignmentAttachment(batchId, file, this.context(request, ua)) };
  }

  @Get('assignment-batches/:batchId/attachments/:attachmentId/download')
  @RequirePermission('leads.read.all')
  async assignmentAttachmentDownload(@Param('batchId') batchId: string, @Param('attachmentId') attachmentId: string, @Req() request: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.leads.getAssignmentAttachmentDownload(batchId, attachmentId, this.context(request, ua)) };
  }

  @Delete('assignment-batches/:batchId/attachments/:attachmentId')
  @RequirePermission('leads.assign')
  async deleteAssignmentAttachment(@Param('batchId') batchId: string, @Param('attachmentId') attachmentId: string, @Req() request: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.leads.deleteAssignmentAttachment(batchId, attachmentId, this.context(request, ua)) };
  }

  @Post(':id/assign-team') @RequirePermission('leads.assign') async assignTeam(@Param('id')id:string,@Body()body:{teamId?:string|null},@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.assignTeam(id,body.teamId??null,this.context(request,ua))};}
  @Patch(':id/revenue') @RequirePermission('leads.update.all') async revenue(@Param('id')id:string,@Body()body:{proposedRevenue?:number;revenueProbability?:number;actualRevenue?:number|null},@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.updateRevenue(id,body,this.context(request,ua))};}
  @Get(':id') @RequirePermission('leads.read.all') async get(@Param('id')id:string){return{success:true,data:await this.leads.get(id)};}
  @Get(':id/assignments') @RequirePermission('leads.read.all') async assignments(@Param('id')id:string){return{success:true,data:await this.leads.assignments(id)};}
  @Post(':id/reassign') @RequirePermission('leads.assign') async reassign(@Param('id')id:string,@Body()body:Partial<AssignmentInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.reassign(id,body,this.context(request,ua))};}
  @Post(':id/stage') @RequirePermission('leads.update.all') async changeStage(@Param('id')id:string,@Body()body:{stage:LeadStage;reason?:string|null;expectedRevenue?:number|null},@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.changeStage(id,body.stage,this.context(request,ua),undefined,body.reason,body.expectedRevenue)};}
  @Post('import/preview') @RequirePermission('leads.create') async previewImport(@Body()body:{rows?:any[]}){return{success:true,data:await this.leads.previewImport(body)};}
  @Post('import/commit') @RequirePermission('leads.create') async commitImport(@Body()body:{rows?:any[]},@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.commitImport(body,this.context(request,ua))};}
  @Post('organization') @RequirePermission('leads.create') async createOrganizationLead(@Body()body:Partial<OrganizationLeadInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.createOrganizationLead(body,this.context(request,ua))};}
  @Post() @RequirePermission('leads.create') async create(@Body()body:Partial<LeadInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.create(body,this.context(request,ua))};}
  @Patch(':id') @RequirePermission('leads.update.all') async update(@Param('id')id:string,@Body()body:Partial<LeadInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.update(id,body,this.context(request,ua))};}
  @Delete(':id') @RequirePermission('leads.update.all') async deleteLead(@Param('id')id:string,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,message:'Lead deleted',data:await this.leads.deleteLead(id,this.context(request,ua))};}
  @Post(':id/assignments') @RequirePermission('leads.assign') async assign(@Param('id')id:string,@Body()body:Partial<AssignmentInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.assign(id,body,this.context(request,ua))};}
  private context(request:AuthenticatedRequest,userAgent?:string){return{actorUserId:request.user!.id,ipAddress:request.ip,userAgent};}
}
