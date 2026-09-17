import { Module } from '@nestjs/common';

import { ActivitiesController, AdminFollowUpsController, LeadActivitiesController } from './activities.controller.js';
import { ActivitiesRepository } from './activities.repository.js';
import { ActivitiesService } from './activities.service.js';

@Module({
  controllers: [ActivitiesController, LeadActivitiesController, AdminFollowUpsController],
  providers: [ActivitiesRepository, ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
