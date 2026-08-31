import { Body, Controller, Get, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { type AssignmentInput, type BulkAssignmentInput, type LeadInput, type OrganizationLeadInput } from './leads.repository.js';
import { LeadsService } from './leads.service.js';

@Controller('admin/leads')
@UseGuards(AuthGuard, PermissionGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}
  @Get() @RequirePermission('leads.read.all') async list(){return{success:true,data:await this.leads.list()};}
  @Post('bulk-assign') @RequirePermission('leads.assign') async bulkAssign(@Body()body:Partial<BulkAssignmentInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.bulkAssign(body,this.context(request,ua))};}
  @Get(':id') @RequirePermission('leads.read.all') async get(@Param('id')id:string){return{success:true,data:await this.leads.get(id)};}
  @Get(':id/assignments') @RequirePermission('leads.read.all') async assignments(@Param('id')id:string){return{success:true,data:await this.leads.assignments(id)};}
  @Post('organization') @RequirePermission('leads.create') async createOrganizationLead(@Body()body:Partial<OrganizationLeadInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.createOrganizationLead(body,this.context(request,ua))};}
  @Post() @RequirePermission('leads.create') async create(@Body()body:Partial<LeadInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.create(body,this.context(request,ua))};}
  @Patch(':id') @RequirePermission('leads.update.all') async update(@Param('id')id:string,@Body()body:Partial<LeadInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.update(id,body,this.context(request,ua))};}
  @Post(':id/assignments') @RequirePermission('leads.assign') async assign(@Param('id')id:string,@Body()body:Partial<AssignmentInput>,@Req()request:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.leads.assign(id,body,this.context(request,ua))};}
  private context(request:AuthenticatedRequest,userAgent?:string){return{actorUserId:request.user!.id,ipAddress:request.ip,userAgent};}
}
