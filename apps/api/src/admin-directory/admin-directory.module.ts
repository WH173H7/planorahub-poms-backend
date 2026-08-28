import { Module } from '@nestjs/common';

import { AdminDirectoryController } from './admin-directory.controller.js';

import { AdminDirectoryService } from './admin-directory.service.js';

@Module({
  controllers: [
    AdminDirectoryController,
  ],

  providers: [
    AdminDirectoryService,
  ],

  exports: [
    AdminDirectoryService,
  ],
})
export class AdminDirectoryModule {}