import { Module } from '@nestjs/common';

import { ContactsController } from './contacts.controller.js';
import { ContactsRepository } from './contacts.repository.js';
import { ContactsService } from './contacts.service.js';

@Module({
  controllers: [ContactsController],
  providers: [
    ContactsRepository,
    ContactsService,
  ],
  exports: [ContactsService],
})
export class ContactsModule {}
