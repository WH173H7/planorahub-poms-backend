import { Module } from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service.js';

import { TasksController } from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';
import { StaffTasksController } from './staff-tasks.controller.js';
import { TaskDispatchService } from './task-dispatch.service.js';

@Module({
  controllers: [
    TasksController,
    StaffTasksController,
  ],
  providers: [
    SupabaseService,
    TasksRepository,
    TasksService,
    TaskDispatchService,
  ],
  exports: [
    TasksService,
    TaskDispatchService,
  ],
})
export class TasksModule {}
