import {Controller,Get,Post,Query,Req,UseGuards} from '@nestjs/common';
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
  @Query('from') from?:string,@Query('to') to?:string,@Query('staffId') staffId?:string,
  @Query('departmentId') departmentId?:string,@Query('organizationId') organizationId?:string,
  @Query('recordType') recordType?:string,@Query('leadStage') leadStage?:string,
  @Query('taskStatus') taskStatus?:string,@Query('focus') focus?:string,
 ){
  return{success:true,data:await this.service.company({from,to,staffId,departmentId,organizationId,recordType,leadStage,taskStatus,focus})};
 }

 @Post('email')
 @RequirePermission('reports.read')
 async emailReport(
  @Req() req:AuthenticatedRequest,
  @Query('from') from?:string,@Query('to') to?:string,@Query('staffId') staffId?:string,
  @Query('departmentId') departmentId?:string,@Query('organizationId') organizationId?:string,
  @Query('recordType') recordType?:string,@Query('leadStage') leadStage?:string,
  @Query('taskStatus') taskStatus?:string,@Query('focus') focus?:string,
 ){
  return{success:true,data:await this.service.emailCompanyReport({from,to,staffId,departmentId,organizationId,recordType,leadStage,taskStatus,focus},req.user!.email)};
 }
}
