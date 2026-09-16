import {Controller,Get,Headers,Post,Query,Req,UseGuards} from '@nestjs/common';
import {AuthGuard,type AuthenticatedRequest} from '../auth/auth.guard.js';
import {PermissionGuard} from '../permissions/permission.guard.js';
import {RequirePermission} from '../auth/require-permission.decorator.js';
import {ReportsService} from './reports.service.js';

@Controller('admin/reports')
@UseGuards(AuthGuard,PermissionGuard)
export class ReportsController{
 constructor(private readonly service:ReportsService){}

 @Get()
 @RequirePermission('reports.read')
 async report(
  @Req() req:AuthenticatedRequest,@Headers('user-agent')ua?:string,
  @Query('from') from?:string,@Query('to') to?:string,@Query('staffId') staffId?:string,
  @Query('departmentId') departmentId?:string,@Query('organizationId') organizationId?:string,
  @Query('recordType') recordType?:string,@Query('leadStage') leadStage?:string,
  @Query('taskStatus') taskStatus?:string,@Query('focus') focus?:string,
 ){
  const filters={from,to,staffId,departmentId,organizationId,recordType,leadStage,taskStatus,focus};
  const data=await this.service.company(filters);
  await this.service.auditReport('REPORT_GENERATED',filters,this.ctx(req,ua));
  return{success:true,data};
 }

 @Post('downloaded')
 @RequirePermission('reports.read')
 async downloaded(
  @Req() req:AuthenticatedRequest,@Headers('user-agent')ua?:string,
  @Query('from') from?:string,@Query('to') to?:string,@Query('staffId') staffId?:string,
  @Query('departmentId') departmentId?:string,@Query('organizationId') organizationId?:string,
  @Query('recordType') recordType?:string,@Query('leadStage') leadStage?:string,
  @Query('taskStatus') taskStatus?:string,@Query('focus') focus?:string,
 ){
  const filters={from,to,staffId,departmentId,organizationId,recordType,leadStage,taskStatus,focus};
  await this.service.auditReport('REPORT_DOWNLOADED',filters,this.ctx(req,ua));
  return{success:true,data:true};
 }

 @Post('email')
 @RequirePermission('reports.read')
 async emailReport(
  @Req() req:AuthenticatedRequest,@Headers('user-agent')ua?:string,
  @Query('from') from?:string,@Query('to') to?:string,@Query('staffId') staffId?:string,
  @Query('departmentId') departmentId?:string,@Query('organizationId') organizationId?:string,
  @Query('recordType') recordType?:string,@Query('leadStage') leadStage?:string,
  @Query('taskStatus') taskStatus?:string,@Query('focus') focus?:string,
 ){
  const filters={from,to,staffId,departmentId,organizationId,recordType,leadStage,taskStatus,focus};
  return{success:true,data:await this.service.emailCompanyReport(filters,req.user!.email,this.ctx(req,ua))};
 }

 private ctx(req:AuthenticatedRequest,userAgent?:string){return{actorUserId:req.user!.id,ipAddress:req.ip,userAgent}}
}
