import { Module } from '@nestjs/common';
import { StaffMailService } from '../mailer/staff-mail.service.js';
import { CrmMailController } from './crm-mail.controller.js';
import { CrmMailService } from './crm-mail.service.js';

@Module({ controllers: [CrmMailController], providers: [CrmMailService, StaffMailService] })
export class CrmMailModule {}
