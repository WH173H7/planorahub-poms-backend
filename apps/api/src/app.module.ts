import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { UsersModule } from './users/users.module.js';
import { AdminDirectoryModule } from './admin-directory/admin-directory.module.js';

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
    UsersModule,

  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,
  ],
})

export class AppModule {}