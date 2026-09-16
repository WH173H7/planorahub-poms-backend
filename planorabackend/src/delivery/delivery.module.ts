import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller.js';
import { DeliveryService } from './delivery.service.js';
import { StaffMailService } from '../mailer/staff-mail.service.js';
@Module({controllers:[DeliveryController],providers:[DeliveryService,StaffMailService]})
export class DeliveryModule {}
