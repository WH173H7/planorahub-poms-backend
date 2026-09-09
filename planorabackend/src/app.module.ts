import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ActivitiesModule } from './activities/activities.module.js';
import { AdminDirectoryModule } from './admin-directory/admin-directory.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ContactsModule } from './contacts/contacts.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PursuitWorkflowsModule } from './pursuit-workflows/pursuit-workflows.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { TeamActivityModule } from './team-activity/team-activity.module.js';
import { UsersModule } from './users/users.module.js';
import { TaskWorkflowsModule } from './task-workflows/task-workflows.module.js';
import { CommunicationsModule } from './communications/communications.module.js';
import { InternalChatModule } from './internal-chat/internal-chat.module.js';
import { GmailModule } from './gmail/gmail.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { LetterheadModule } from './letterhead/letterhead.module.js';
import { WorkspaceOpsModule } from './workspace-ops/workspace-ops.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    DeliveryModule,
    SupabaseModule,
    AuditModule,
    AuthModule,
    PermissionsModule,
    AdminDirectoryModule,
    OrganizationsModule,
    ContactsModule,
    LeadsModule,
    PursuitWorkflowsModule,
    TasksModule,
    ActivitiesModule,
    TeamActivityModule,
    AnalyticsModule,
    UsersModule,
    TaskWorkflowsModule,
    CommunicationsModule,
    InternalChatModule,
    GmailModule,
    ReportsModule,
    LetterheadModule,
    WorkspaceOpsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
