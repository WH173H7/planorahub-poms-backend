import { Body,Controller,Get,Headers,Param,Post,Query,Req,UseGuards } from '@nestjs/common';
import { AuthGuard,type AuthenticatedRequest } from '../auth/auth.guard.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { DeliveryService } from './delivery.service.js';
@Controller()
@UseGuards(AuthGuard)
export class DeliveryController{
 constructor(private readonly delivery:DeliveryService){}
 @Get('admin/dashboard') @UseGuards(PermissionGuard) @RequirePermission('analytics.read.all') dashboard(){return this.wrap(this.delivery.dashboard())}
 @Get('admin/prospects') @UseGuards(PermissionGuard) @RequirePermission('leads.read.all') prospects(){return this.wrap(this.delivery.lifecycle('PROSPECT'))}
 @Get('admin/clients') @UseGuards(PermissionGuard) @RequirePermission('leads.read.all') clients(){return this.wrap(this.delivery.lifecycle('CLIENT'))}
 @Post('admin/leads/:id/approve-prospect') @UseGuards(PermissionGuard) @RequirePermission('leads.update.all') approve(@Param('id')id:string,@Req()req:AuthenticatedRequest,@Headers('user-agent')ua?:string){return this.wrap(this.delivery.approveProspect(id,this.ctx(req,ua)))}
 @Post('admin/leads/:id/reject-prospect') @UseGuards(PermissionGuard) @RequirePermission('leads.update.all') reject(@Param('id')id:string,@Body()body:{reason?:string},@Req()req:AuthenticatedRequest,@Headers('user-agent')ua?:string){return this.wrap(this.delivery.rejectProspect(id,body.reason,this.ctx(req,ua)))}
 @Post('admin/prospects/:id/convert-client') @UseGuards(PermissionGuard) @RequirePermission('leads.update.all') client(@Param('id')id:string,@Req()req:AuthenticatedRequest,@Headers('user-agent')ua?:string){return this.wrap(this.delivery.convertClient(id,this.ctx(req,ua)))}
 @Post('admin/clients/:id/revenue') @UseGuards(PermissionGuard) @RequirePermission('leads.update.all') revenue(@Param('id')id:string,@Body()body:{amount:number},@Req()req:AuthenticatedRequest,@Headers('user-agent')ua?:string){return this.wrap(this.delivery.recordClientRevenue(id,body.amount,this.ctx(req,ua)))}
 @Get('admin/audit-feed') @UseGuards(PermissionGuard) @RequirePermission('audit.read.all') audit(@Query('limit')limit?:string,@Query('offset')offset?:string){return this.wrap(this.delivery.auditFeed(Number(limit)||250,Number(offset)||0))}
 @Get('admin/latest-activities') @UseGuards(PermissionGuard) @RequirePermission('activities.read.all') latestActivities(){return this.wrap(this.delivery.latestActivities())}
  @Get('admin/calendar') @UseGuards(PermissionGuard) @RequirePermission('activities.read.all') calendar(){return this.wrap(this.delivery.calendar())}
 @Get('staff/calendar') staffCalendar(@Req()req:AuthenticatedRequest){return this.wrap(this.delivery.calendar(req.user!.id,true))}
 @Get('staff/home-summary') home(@Req()req:AuthenticatedRequest){return this.wrap(this.delivery.staffHome(req.user!.id))}
 private async wrap<T>(p:Promise<T>|T){return{success:true,data:await p}}
 private ctx(req:AuthenticatedRequest,userAgent?:string){return{actorUserId:req.user!.id,ipAddress:req.ip,userAgent}}
}
