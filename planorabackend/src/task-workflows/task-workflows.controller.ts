import {Body,Controller,Delete,Get,Headers,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {AuthGuard,type AuthenticatedRequest} from '../auth/auth.guard.js';
import {PermissionGuard} from '../permissions/permission.guard.js';
import {RequirePermission} from '../auth/require-permission.decorator.js';
import {TaskWorkflowsService} from './task-workflows.service.js';

@Controller('task-workflows')
@UseGuards(AuthGuard,PermissionGuard)
export class TaskWorkflowsController{
 constructor(private readonly service:TaskWorkflowsService){}
 @Get() @RequirePermission('task_workflows.read') async list(){return{success:true,data:await this.service.list(true)}}
 @Get('admin/all') @RequirePermission('task_workflows.manage') async all(){return{success:true,data:await this.service.list(false)}}
 @Post() @RequirePermission('task_workflows.manage') async create(@Body()body:any,@Req()req:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.service.create(body,this.ctx(req,ua))}}
 @Patch(':id') @RequirePermission('task_workflows.manage') async update(@Param('id')id:string,@Body()body:any,@Req()req:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.service.update(id,body,this.ctx(req,ua))}}
 @Delete(':id') @RequirePermission('task_workflows.manage') async archive(@Param('id')id:string,@Req()req:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.service.archive(id,this.ctx(req,ua))}}
 private ctx(req:AuthenticatedRequest,ua?:string){return{actorUserId:req.user!.id,ipAddress:req.ip,userAgent:ua}}
}
