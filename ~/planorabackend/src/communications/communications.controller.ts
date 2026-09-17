import {Body,Controller,Delete,Get,Headers,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {AuthGuard,type AuthenticatedRequest} from '../auth/auth.guard.js';import {PermissionGuard} from '../permissions/permission.guard.js';import {RequirePermission} from '../auth/require-permission.decorator.js';import {CommunicationsService} from './communications.service.js';
@Controller('communications/templates') @UseGuards(AuthGuard,PermissionGuard)
export class CommunicationsController{constructor(private readonly service:CommunicationsService){}
@Get() @RequirePermission('templates.read') async list(){return{success:true,data:await this.service.list(true)}}
@Get('admin/all') @RequirePermission('templates.manage') async all(){return{success:true,data:await this.service.list(false)}}
@Post() @RequirePermission('templates.manage') async create(@Body()b:any,@Req()r:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.service.create(b,this.ctx(r,ua))}}
@Patch(':id') @RequirePermission('templates.manage') async update(@Param('id')id:string,@Body()b:any,@Req()r:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.service.update(id,b,this.ctx(r,ua))}}
@Delete(':id') @RequirePermission('templates.manage') async archive(@Param('id')id:string,@Req()r:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.service.archive(id,this.ctx(r,ua))}}
private ctx(r:AuthenticatedRequest,ua?:string){return{actorUserId:r.user!.id,ipAddress:r.ip,userAgent:ua}}}
