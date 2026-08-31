import { Module } from '@nestjs/common';
import { PursuitWorkflowsController } from './pursuit-workflows.controller.js';
import { PursuitWorkflowsService } from './pursuit-workflows.service.js';
@Module({controllers:[PursuitWorkflowsController],providers:[PursuitWorkflowsService],exports:[PursuitWorkflowsService]})
export class PursuitWorkflowsModule {}
