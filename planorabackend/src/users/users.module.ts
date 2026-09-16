import { Module } from '@nestjs/common';

import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';
import { StaffMailService } from '../mailer/staff-mail.service.js';

@Module({
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    StaffMailService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
