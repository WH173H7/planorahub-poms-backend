import { Module } from '@nestjs/common';

import { TeamActivityController } from './team-activity.controller.js';
import { TeamActivityService } from './team-activity.service.js';

@Module({
  controllers: [TeamActivityController],
  providers: [TeamActivityService],
  exports: [TeamActivityService],
})
export class TeamActivityModule {}
