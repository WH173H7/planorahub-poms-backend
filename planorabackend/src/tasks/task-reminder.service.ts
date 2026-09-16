import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service.js';
import { StaffMailService } from '../mailer/staff-mail.service.js';

@Injectable()
export class TaskReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskReminderService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly mail: StaffMailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 5 * 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const tasks = (await this.db.query(`
        SELECT t.id,t.title,t.due_at,t.assigned_to_id,t.assigned_team_id,t.assigned_department_id,
               t.status,t.control_state,o.name AS organization_name
        FROM tasks t
        LEFT JOIN organizations o ON o.id=t.organization_id
        WHERE t.due_at IS NOT NULL
          AND t.status NOT IN ('COMPLETED','CANCELLED')
          AND t.control_state NOT IN ('PAUSED','CANCELLED')
          AND t.due_at > NOW() - INTERVAL '24 hours'
          AND t.due_at <= NOW() + INTERVAL '24 hours'
        ORDER BY t.due_at
      `)).rows;

      for (const task of tasks) {
        const dueAt = new Date(task.due_at);
        const kind: 'ONE_DAY' | 'DUE' = dueAt.getTime() <= Date.now() ? 'DUE' : 'ONE_DAY';
        const recipients = (await this.db.query(`
          SELECT DISTINCT u.id,u.first_name,u.last_name,u.email,r.code AS role_code
          FROM users u
          JOIN roles r ON r.id=u.role_id
          WHERE u.status='ACTIVE' AND (
            r.code='SUPER_ADMIN'
            OR u.id=$1::uuid
            OR ($2::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.user_id=u.id AND tm.team_id=$2::uuid))
            OR ($3::uuid IS NOT NULL AND u.department_id=$3::uuid)
          )
          ORDER BY CASE WHEN r.code='SUPER_ADMIN' THEN 0 ELSE 1 END,u.first_name,u.last_name
        `,[task.assigned_to_id,task.assigned_team_id,task.assigned_department_id])).rows;

        for (const recipient of recipients) {
          if (!recipient.email) continue;
          const claim = await this.db.query(`
            INSERT INTO task_due_reminder_deliveries(task_id,user_id,reminder_kind,due_at_snapshot,email_status)
            VALUES($1,$2,$3,$4,'PENDING')
            ON CONFLICT(task_id,user_id,reminder_kind,due_at_snapshot) DO NOTHING
            RETURNING id
          `,[task.id,recipient.id,kind,task.due_at]);
          if (!claim.rowCount) continue;

          const dueText = this.formatDueDate(dueAt);
          const isAdmin = recipient.role_code === 'SUPER_ADMIN';
          const hasStaffAssignment = Boolean(task.assigned_to_id || task.assigned_team_id || task.assigned_department_id);
          const title = kind === 'DUE' ? 'Task deadline reminder' : 'Task due within 24 hours';
          const message = kind === 'DUE'
            ? `${task.title}${task.organization_name ? ` · ${task.organization_name}` : ''} is due ${dueText}. ${isAdmin ? (hasStaffAssignment ? 'Open the task to review its delivery status and assignment.' : 'This task has no staff assignment yet; open it to review and assign ownership.') : 'Open the task and complete or update it now.'}`
            : `${task.title}${task.organization_name ? ` · ${task.organization_name}` : ''} is due ${dueText}. ${isAdmin ? (hasStaffAssignment ? 'This reminder is also being sent to the active assigned staff.' : 'This task has no staff assignment yet; open it to assign ownership before the deadline.') : 'Please review the task before the deadline.'}`;

          await this.db.query(`
            INSERT INTO notifications(user_id,title,body,kind,href)
            VALUES($1,$2,$3,'TASK_REMINDER','/tasks/'||$4::text)
          `,[recipient.id,title,message,task.id]);

          const delivery = await this.mail.sendOperational({
            to: recipient.email,
            firstName: recipient.first_name,
            subject: kind === 'DUE' ? `Task due: ${task.title}` : `Reminder: ${task.title} is due within 24 hours`,
            title,
            message,
            ctaLabel: isAdmin ? 'Review task' : 'Open task',
            ctaPath: `/tasks/${task.id}`,
            idempotencyKey: `task-reminder/${task.id}/${recipient.id}/${kind}/${dueAt.toISOString()}`,
          });

          await this.db.query(`
            UPDATE task_due_reminder_deliveries
            SET email_status=$2,email_message=$3,sent_at=NOW()
            WHERE id=$1
          `,[claim.rows[0].id,delivery.status,delivery.message]);
        }
      }
    } catch (error) {
      this.logger.error('Task deadline reminder check failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }

  private formatDueDate(value: Date) {
    const timeZone = this.config.get<string>('CRM_TIMEZONE')?.trim() || 'Africa/Lagos';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(value);
    } catch {
      return value.toISOString();
    }
  }
}
