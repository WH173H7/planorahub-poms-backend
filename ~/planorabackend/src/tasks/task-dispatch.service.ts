import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TasksRepository } from './tasks.repository.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class TaskDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskDispatchService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly tasks: TasksRepository, private readonly audit: AuditService) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const dispatched = await this.tasks.dispatchDueScheduled();
      if (dispatched.length > 0) {
        for (const task of dispatched) {
          await this.audit.log({
            action: 'TASK_AUTO_DISPATCHED',
            module: 'tasks',
            entityType: 'task',
            entityId: task.id,
            newValues: { controlState: 'ACTIVE', dispatchedAt: task.dispatched_at },
          });
        }
        this.logger.log(`Dispatched ${dispatched.length} scheduled task(s)`);
      }
    } catch (error) {
      this.logger.error(
        'Scheduled task dispatch check failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
