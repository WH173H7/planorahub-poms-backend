import {Body,Controller,Delete,Get,Param,Post,Query,Req,Res,UseGuards} from '@nestjs/common';
import type {Response} from 'express';import {AuthGuard,type AuthenticatedRequest} from '../auth/auth.guard.js';import {PermissionGuard} from '../permissions/permission.guard.js';import {RequirePermission} from '../auth/require-permission.decorator.js';import {GmailService} from './gmail.service.js';
@Controller()
export class GmailController{constructor(private readonly service:GmailService){}
@Get('gmail/status') @UseGuards(AuthGuard,PermissionGuard) @RequirePermission('gmail.use') async status(@Req()r:AuthenticatedRequest){return{success:true,data:await this.service.status(r.user!.id)}}
@Get('gmail/connect') @UseGuards(AuthGuard,PermissionGuard) @RequirePermission('gmail.use') connect(@Req()r:AuthenticatedRequest){return{success:true,data:{url:this.service.connectUrl(r.user!.id)}}}
@Delete('gmail/connection') @UseGuards(AuthGuard,PermissionGuard) @RequirePermission('gmail.use') async disconnect(@Req()r:AuthenticatedRequest){return{success:true,data:await this.service.disconnect(r.user!.id)}}
@Get('gmail/messages') @UseGuards(AuthGuard,PermissionGuard) @RequirePermission('gmail.use') async messages(@Req()r:AuthenticatedRequest,@Query('q')q?:string){return{success:true,data:await this.service.list(r.user!.id,q)}}
@Get('gmail/messages/:id') @UseGuards(AuthGuard,PermissionGuard) @RequirePermission('gmail.use') async message(@Req()r:AuthenticatedRequest,@Param('id')id:string){return{success:true,data:await this.service.getMessage(r.user!.id,id)}}
@Post('google-calendar/events') @UseGuards(AuthGuard,PermissionGuard) @RequirePermission('gmail.use') async calendarEvent(@Req()r:AuthenticatedRequest,@Body()b:any){return{success:true,data:await this.service.createCalendarEvent(r.user!.id,b)}}
@Post('gmail/send') @UseGuards(AuthGuard,PermissionGuard) @RequirePermission('gmail.use') async send(@Req()r:AuthenticatedRequest,@Body()b:any){return{success:true,data:await this.service.send(r.user!.id,b)}}
@Get('integrations/google/callback') async callback(@Query('code')code:string,@Query('state')state:string,@Res()res:Response){const url=await this.service.callback(code,state);res.redirect(url)}
}
