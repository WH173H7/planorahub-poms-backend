import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { StaffMailService } from '../mailer/staff-mail.service.js';

@Module({ controllers: [InvoicesController], providers: [InvoicesService, StaffMailService] })
export class InvoicesModule {}
