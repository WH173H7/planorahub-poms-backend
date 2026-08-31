import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async log(params: {
    actorUserId?: string;
    action: string;
    module: string;
    entityType: string;
    entityId?: string;
    oldValues?: unknown;
    newValues?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.db.query(
      `
      INSERT INTO audit_logs (
        actor_user_id,
        action,
        module,
        entity_type,
        entity_id,
        old_values,
        new_values,
        ip_address,
        user_agent
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      )
      `,
      [
        params.actorUserId ?? null,
        params.action,
        params.module,
        params.entityType,
        params.entityId ?? null,
        params.oldValues ? JSON.stringify(params.oldValues) : null,
        params.newValues ? JSON.stringify(params.newValues) : null,
        params.ipAddress ?? null,
        params.userAgent ?? null,
      ],
    );
  }
}
