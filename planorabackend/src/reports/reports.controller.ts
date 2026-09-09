import {Controller,Get,Query,UseGuards} from '@nestjs/common';
import {AuthGuard} from '../auth/auth.guard.js';
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
}
