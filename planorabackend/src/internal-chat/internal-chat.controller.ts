import {Body,Controller,Get,Headers,Param,Post,Query,Req,UseGuards} from '@nestjs/common';
import {AuthGuard,type AuthenticatedRequest} from '../auth/auth.guard.js';import {PermissionGuard} from '../permissions/permission.guard.js';import {RequirePermission} from '../auth/require-permission.decorator.js';import {InternalChatService} from './internal-chat.service.js';
@Controller('internal-chat') @UseGuards(AuthGuard,PermissionGuard)
export class InternalChatController{constructor(private readonly service:InternalChatService){}
@Get('channels') @RequirePermission('chat.read') async channels(@Req()r:AuthenticatedRequest){return{success:true,data:await this.service.channels(r.user!.roleCode)}}
@Post('channels') @RequirePermission('chat.manage') async create(@Body()b:any,@Req()r:AuthenticatedRequest,@Headers('user-agent')ua?:string){return{success:true,data:await this.service.createChannel(b,{actorUserId:r.user!.id,ipAddress:r.ip,userAgent:ua})}}
@Get('channels/:id/messages') @RequirePermission('chat.read') async messages(@Param('id')id:string,@Query('before')before:string|undefined,@Req()r:AuthenticatedRequest){return{success:true,data:await this.service.messages(id,r.user!.roleCode,before)}}
@Post('channels/:id/messages') @RequirePermission('chat.send') async send(@Param('id')id:string,@Body()b:{body:string},@Req()r:AuthenticatedRequest){return{success:true,data:await this.service.send(id,b.body,r.user!.id,r.user!.roleCode)}}}
