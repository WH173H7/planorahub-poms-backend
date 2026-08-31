import { Body,Controller,Delete,Get,Headers,Param,Patch,Post,Req,UploadedFile,UseGuards,UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard,type AuthenticatedRequest } from '../auth/auth.guard.js';import { PermissionGuard } from '../permissions/permission.guard.js';import { RequirePermission } from '../auth/require-permission.decorator.js';import { PursuitWorkflowsService } from './pursuit-workflows.service.js';
@Controller('admin') @UseGuards(AuthGuard,PermissionGuard) export class PursuitWorkflowsController{constructor(private s:PursuitWorkflowsService){}private c(r:AuthenticatedRequest,u?:string){return{actorUserId:r.user!.id,ipAddress:r.ip,userAgent:u}}
@Get('pursuit-workflows') @RequirePermission('leads.read.all') async list(){return{success:true,data:await this.s.list()}}
@Post('pursuit-workflows') @RequirePermission('leads.update.all') async create(@Body()b:any,@Req()r:AuthenticatedRequest,@Headers('user-agent')u?:string){return{success:true,data:await this.s.create(b,this.c(r,u))}}
@Delete('pursuit-workflows/:id') @RequirePermission('leads.update.all') async del(@Param('id')id:string,@Req()r:AuthenticatedRequest,@Headers('user-agent')u?:string){return{success:true,data:await this.s.remove(id,this.c(r,u))}}
@Get('leads/:leadId/pursuit') @RequirePermission('leads.read.all') async pursuit(@Param('leadId')id:string){return{success:true,data:await this.s.getLeadPursuit(id)}}
@Patch('leads/:leadId/pursuit/steps/:stepId') @RequirePermission('leads.update.all') async step(@Param('leadId')l:string,@Param('stepId')s:string,@Body()b:any,@Req()r:AuthenticatedRequest,@Headers('user-agent')u?:string){return{success:true,data:await this.s.updateStep(l,s,b,this.c(r,u))}}
@Post('leads/:leadId/pursuit/steps/:stepId/evidence') @RequirePermission('leads.update.all') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024,files:1}})) async ev(@Param('leadId')l:string,@Param('stepId')s:string,@UploadedFile()f:any,@Req()r:AuthenticatedRequest,@Headers('user-agent')u?:string){return{success:true,data:await this.s.evidence(l,s,f,this.c(r,u))}}
}
