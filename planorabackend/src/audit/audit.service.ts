import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

type AuditInput = {
  actorUserId?: string;
  action: string;
  module: string;
  entityType: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
  userAgent?: string;
};

type ActorSnapshot = {
  actor_user_id_snapshot: string | null;
  actor_name_snapshot: string | null;
  actor_email_snapshot: string | null;
  actor_role_snapshot: string | null;
  actor_department_snapshot: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async log(params: AuditInput) {
    const snapshot = await this.actorSnapshot(params.actorUserId);

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
        user_agent,
        actor_user_id_snapshot,
        actor_name_snapshot,
        actor_email_snapshot,
        actor_role_snapshot,
        actor_department_snapshot
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      `,
      [
        params.actorUserId ?? null,
        params.action,
        params.module,
        params.entityType,
        params.entityId ?? null,
        params.oldValues !== undefined ? JSON.stringify(params.oldValues) : null,
        params.newValues !== undefined ? JSON.stringify(params.newValues) : null,
        params.ipAddress ?? null,
        params.userAgent ?? null,
        snapshot.actor_user_id_snapshot,
        snapshot.actor_name_snapshot,
        snapshot.actor_email_snapshot,
        snapshot.actor_role_snapshot,
        snapshot.actor_department_snapshot,
      ],
    );
  }

  /**
   * Read/open events can fire several times while a React view refreshes.
   * Keep the security trail useful by recording at most one identical open
   * event per actor/entity within the requested window.
   */
  async logOnce(params: AuditInput, withinSeconds = 300) {
    const duplicate = await this.db.query(
      `SELECT 1
       FROM audit_logs
       WHERE actor_user_id IS NOT DISTINCT FROM $1::uuid
         AND action=$2
         AND module=$3
         AND entity_type=$4
         AND entity_id IS NOT DISTINCT FROM $5::uuid
         AND created_at > NOW() - ($6::int * INTERVAL '1 second')
       LIMIT 1`,
      [
        params.actorUserId ?? null,
        params.action,
        params.module,
        params.entityType,
        params.entityId ?? null,
        Math.max(1, Math.floor(withinSeconds)),
      ],
    );
    if (duplicate.rowCount) return false;
    await this.log(params);
    return true;
  }

  private async actorSnapshot(actorUserId?: string): Promise<ActorSnapshot> {
    if (!actorUserId) {
      return {
        actor_user_id_snapshot: null,
        actor_name_snapshot: null,
        actor_email_snapshot: null,
        actor_role_snapshot: null,
        actor_department_snapshot: null,
      };
    }

    const row = (await this.db.query<ActorSnapshot>(
      `SELECT
         u.id AS actor_user_id_snapshot,
         NULLIF(TRIM(CONCAT_WS(' ',u.first_name,u.last_name)),'') AS actor_name_snapshot,
         u.email AS actor_email_snapshot,
         r.name AS actor_role_snapshot,
         d.name AS actor_department_snapshot
       FROM users u
       LEFT JOIN roles r ON r.id=u.role_id
       LEFT JOIN departments d ON d.id=u.department_id
       WHERE u.id=$1
       LIMIT 1`,
      [actorUserId],
    )).rows[0];

    return row ?? {
      actor_user_id_snapshot: actorUserId,
      actor_name_snapshot: null,
      actor_email_snapshot: null,
      actor_role_snapshot: null,
      actor_department_snapshot: null,
    };
  }
}
