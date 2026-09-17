import { Module } from '@nestjs/common';

import { ActivitiesController } from './activities.controller.js';
import { ActivitiesRepository } from './activities.repository.js';
import { ActivitiesService } from './activities.service.js';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesRepository, ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
