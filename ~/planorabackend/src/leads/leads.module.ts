import { Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module.js";
import { ActivitiesModule } from "../activities/activities.module.js";
import { ContactsModule } from "../contacts/contacts.module.js";
import { PursuitWorkflowsModule } from "../pursuit-workflows/pursuit-workflows.module.js";
import { StaffMailService } from "../mailer/staff-mail.service.js";

import { LeadsController } from "./leads.controller.js";
import { LeadsRepository } from "./leads.repository.js";
import { LeadsService } from "./leads.service.js";
import { StaffLeadsController } from "./staff-leads.controller.js";

@Module({
  imports: [
    TasksModule,
    ActivitiesModule,
    ContactsModule,
    PursuitWorkflowsModule,
  ],
  controllers: [LeadsController, StaffLeadsController],
  providers: [LeadsRepository, LeadsService, StaffMailService],
  exports: [LeadsService],
})
export class LeadsModule {}
