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
import { LeadsModule } from './leads/leads.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PursuitWorkflowsModule } from './pursuit-workflows/pursuit-workflows.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
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
    AnalyticsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
