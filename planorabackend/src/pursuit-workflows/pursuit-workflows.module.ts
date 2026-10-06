import { Module } from '@nestjs/common';

import { TasksModule } from '../tasks/tasks.module.js';
import { PursuitWorkflowsController } from './pursuit-workflows.controller.js';
import { PursuitWorkflowsService } from './pursuit-workflows.service.js';

@Module({
  imports: [TasksModule],
  controllers: [PursuitWorkflowsController],
  providers: [PursuitWorkflowsService],
  exports: [PursuitWorkflowsService],
})
export class PursuitWorkflowsModule {}
