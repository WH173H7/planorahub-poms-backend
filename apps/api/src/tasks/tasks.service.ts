import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';

import {
  type TaskAttachmentRow,
  type TaskEventType,
  type TaskInput,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
  TasksRepository,
} from './tasks.repository.js';

type ActionContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type UploadedTaskFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type TaskDetail = TaskRow & {
  events: Awaited<
    ReturnType<TasksRepository['events']>
  >;
  attachments: TaskAttachmentRow[];
  lead_assignment_batch: Awaited<ReturnType<TasksRepository['leadAssignmentForTask']>>;
};

const TASK_ATTACHMENTS_BUCKET = 'task-attachments';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

@Injectable()
export class TasksService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseService,
  ) {}

  async list() {
    return this.tasks.list();
  }

  async get(
    id: string,
  ): Promise<TaskDetail> {
    const task =
      await this.tasks.findById(id);

    if (!task) {
      throw new NotFoundException(
        'Task not found',
      );
    }

    const [events, attachments, leadAssignmentBatch] =
      await Promise.all([
        this.tasks.events(id),
        this.tasks.listAttachments(id),
        this.tasks.leadAssignmentForTask(id),
      ]);

    return {
      ...task,
      events,
      attachments,
      lead_assignment_batch: leadAssignmentBatch,
    };
  }

  async create(
    body: Partial<TaskInput>,
    context?: ActionContext,
  ) {
    const input =
      await this.validate(body);

    const task =
      await this.tasks.create(
        input,
        context?.actorUserId,
      );

    try {
      await this.tasks.addEvent({
        taskId: task.id,
        actorUserId:
          context?.actorUserId,
        eventType: 'TASK_CREATED',
        message: 'Task created',
        newValues: task,
      });

      if (task.assigned_to_id) {
        await this.tasks.addEvent({
          taskId: task.id,
          actorUserId:
            context?.actorUserId,
          eventType: 'TASK_ASSIGNED',
          message: 'Task assigned — awaiting acceptance',
          newValues: {
            assignedToId:
              task.assigned_to_id,
          },
        });
      }
    } catch (error) {
      await this.tasks.deleteTask(task.id);
      throw error;
    }

    await this.audit.log({
      actorUserId:
        context?.actorUserId,
      action: 'TASK_CREATED',
      module: 'tasks',
      entityType: 'task',
      entityId: task.id,
      newValues: task,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(task.id);
  }

  async update(
    id: string,
    body: Partial<TaskInput>,
    context?: ActionContext,
  ) {
    const current =
      await this.get(id);

    const input =
      await this.validate({
        title:
          body.title ??
          current.title,
        description:
          body.description === undefined
            ? current.description
            : body.description,
        organizationId:
          body.organizationId === undefined
            ? current.organization_id
            : body.organizationId,
        leadId:
          body.leadId === undefined
            ? current.lead_id
            : body.leadId,
        contactId:
          body.contactId === undefined
            ? current.contact_id
            : body.contactId,
        assignedToId:
          body.assignedToId === undefined
            ? current.assigned_to_id
            : body.assignedToId,
        status:
          body.status ??
          current.status,
        priority:
          body.priority ??
          current.priority,
        startAt:
          body.startAt === undefined
            ? current.start_at
            : body.startAt,
        dueAt:
          body.dueAt === undefined
            ? current.due_at
            : body.dueAt,
      });

    const updated =
      await this.tasks.update(
        id,
        input,
      );

    if (!updated) {
      throw new NotFoundException(
        'Task not found',
      );
    }

    const changes: Array<{
      type: TaskEventType;
      message: string;
      oldValues: unknown;
      newValues: unknown;
    }> = [];

    if (
      current.assigned_to_id !==
      updated.assigned_to_id
    ) {
      changes.push({
        type: 'ASSIGNEE_CHANGED',
        message: 'Assignee changed',
        oldValues: {
          assignedToId:
            current.assigned_to_id,
        },
        newValues: {
          assignedToId:
            updated.assigned_to_id,
        },
      });
    }

    if (
      current.status !==
      updated.status
    ) {
      const type: TaskEventType =
        updated.status === 'COMPLETED'
          ? 'TASK_COMPLETED'
          : current.status === 'COMPLETED'
            ? 'TASK_REOPENED'
            : 'STATUS_CHANGED';

      changes.push({
        type,
        message:
          `Status changed from ${current.status} to ${updated.status}`,
        oldValues: {
          status: current.status,
        },
        newValues: {
          status: updated.status,
        },
      });
    }

    if (
      current.priority !==
      updated.priority
    ) {
      changes.push({
        type: 'PRIORITY_CHANGED',
        message:
          `Priority changed from ${current.priority} to ${updated.priority}`,
        oldValues: {
          priority: current.priority,
        },
        newValues: {
          priority: updated.priority,
        },
      });
    }

    if (
      String(current.due_at ?? '') !==
      String(updated.due_at ?? '')
    ) {
      changes.push({
        type: 'DUE_DATE_CHANGED',
        message: 'Due date changed',
        oldValues: {
          dueAt: current.due_at,
        },
        newValues: {
          dueAt: updated.due_at,
        },
      });
    }

    for (const change of changes) {
      await this.tasks.addEvent({
        taskId: id,
        actorUserId:
          context?.actorUserId,
        eventType: change.type,
        message: change.message,
        oldValues:
          change.oldValues,
        newValues:
          change.newValues,
      });
    }

    await this.audit.log({
      actorUserId:
        context?.actorUserId,
      action:
        changes.length > 0
          ? 'TASK_WORKFLOW_UPDATED'
          : 'TASK_UPDATED',
      module: 'tasks',
      entityType: 'task',
      entityId: id,
      oldValues: current,
      newValues: updated,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(id);
  }

  async accept(
    id: string,
    context?: ActionContext,
  ) {
    const current = await this.ensureTask(id);
    const actorUserId = context?.actorUserId;

    if (!actorUserId) {
      throw new BadRequestException('Authenticated staff member is required');
    }

    if (current.assigned_to_id !== actorUserId) {
      throw new BadRequestException('Only the assigned staff member can accept this task');
    }

    if (current.accepted_at) {
      return this.get(id);
    }

    const updated = await this.tasks.accept(id, actorUserId);

    if (!updated) {
      throw new BadRequestException('Task cannot be accepted');
    }

    await this.tasks.addEvent({
      taskId: id,
      actorUserId,
      eventType: 'STATUS_CHANGED',
      message: 'Task accepted by assigned staff',
      oldValues: { acceptedAt: current.accepted_at },
      newValues: { acceptedAt: updated.accepted_at },
    });

    await this.audit.log({
      actorUserId,
      action: 'TASK_ACCEPTED',
      module: 'tasks',
      entityType: 'task',
      entityId: id,
      newValues: { acceptedAt: updated.accepted_at },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(id);
  }

  async start(
    id: string,
    context?: ActionContext,
  ) {
    const current = await this.ensureTask(id);
    const actorUserId = context?.actorUserId;

    if (!actorUserId) {
      throw new BadRequestException('Authenticated staff member is required');
    }

    if (current.assigned_to_id !== actorUserId) {
      throw new BadRequestException('Only the assigned staff member can start this task');
    }

    if (current.status === 'COMPLETED' || current.status === 'CANCELLED') {
      throw new BadRequestException('This task cannot be started');
    }

    const updated = await this.tasks.start(id, actorUserId);

    if (!updated) {
      throw new BadRequestException('Task cannot be started');
    }

    await this.tasks.addEvent({
      taskId: id,
      actorUserId,
      eventType: 'STATUS_CHANGED',
      message: 'Work started by assigned staff',
      oldValues: {
        status: current.status,
        startedAt: current.started_at,
      },
      newValues: {
        status: 'IN_PROGRESS',
        startedAt: updated.started_at,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'TASK_STARTED',
      module: 'tasks',
      entityType: 'task',
      entityId: id,
      oldValues: { status: current.status },
      newValues: {
        status: 'IN_PROGRESS',
        startedAt: updated.started_at,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(id);
  }

  async deleteTask(
    id: string,
    context?: ActionContext,
  ) {
    const task = await this.get(id);

    const storagePaths = task.attachments
      .map((attachment) => attachment.storage_path)
      .filter((value): value is string => Boolean(value));

    if (storagePaths.length > 0) {
      const removed = await this.supabase.admin.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .remove(storagePaths);

      if (removed.error) {
        throw new BadRequestException(
          `Unable to remove task files: ${removed.error.message}`,
        );
      }
    }

    const deleted = await this.tasks.deleteTask(id);

    if (!deleted) {
      throw new NotFoundException('Task not found');
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'TASK_DELETED',
      module: 'tasks',
      entityType: 'task',
      entityId: id,
      oldValues: task,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return { id, deleted: true };
  }

  async comment(
    id: string,
    message: string,
    parentEventId: string | null,
    context?: ActionContext,
  ) {
    await this.get(id);

    const clean =
      message?.trim();

    if (!clean) {
      throw new BadRequestException(
        'Comment is required',
      );
    }

    const event =
      await this.tasks.addEvent({
        taskId: id,
        actorUserId:
          context?.actorUserId,
        eventType:
          parentEventId
            ? 'REPLY_ADDED'
            : 'COMMENT_ADDED',
        message: clean,
        parentEventId,
      });

    await this.audit.log({
      actorUserId:
        context?.actorUserId,
      action:
        parentEventId
          ? 'TASK_REPLY_ADDED'
          : 'TASK_COMMENT_ADDED',
      module: 'tasks',
      entityType: 'task',
      entityId: id,
      newValues: {
        eventId: event.id,
        message: clean,
        parentEventId,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(id);
  }

  async listAttachments(
    taskId: string,
  ) {
    await this.ensureTask(taskId);
    return this.tasks.listAttachments(taskId);
  }

  async uploadAttachment(
    taskId: string,
    file: UploadedTaskFile | undefined,
    context?: ActionContext,
  ) {
    await this.ensureTask(taskId);

    if (!file) {
      throw new BadRequestException(
        'Attachment file is required',
      );
    }

    if (
      !ALLOWED_ATTACHMENT_MIME_TYPES.has(
        file.mimetype,
      )
    ) {
      throw new BadRequestException(
        'Unsupported attachment type',
      );
    }

    if (
      !file.size ||
      file.size > MAX_ATTACHMENT_BYTES
    ) {
      throw new BadRequestException(
        'Attachment must be 10 MB or smaller',
      );
    }

    const safeName =
      this.safeFileName(
        file.originalname,
      );

    const storagePath =
      `${taskId}/${randomUUID()}-${safeName}`;

    const upload =
      await this.supabase.admin.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .upload(
          storagePath,
          file.buffer,
          {
            contentType: file.mimetype,
            upsert: false,
          },
        );

    if (upload.error) {
      throw new BadRequestException(
        `Attachment upload failed: ${upload.error.message}`,
      );
    }

    try {
      const event =
        await this.tasks.addEvent({
          taskId,
          actorUserId:
            context?.actorUserId,
          eventType: 'FILE_UPLOADED',
          message:
            `Uploaded ${file.originalname}`,
          newValues: {
            fileName: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
          },
        });

      const attachment =
        await this.tasks.createAttachment({
          taskId,
          eventId: event.id,
          uploadedById:
            context?.actorUserId,
          fileName: file.originalname,
          storagePath,
          mimeType: file.mimetype,
          fileSize: file.size,
        });

      await this.audit.log({
        actorUserId:
          context?.actorUserId,
        action:
          'TASK_ATTACHMENT_UPLOADED',
        module: 'tasks',
        entityType:
          'task_attachment',
        entityId: attachment.id,
        newValues: {
          taskId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });

      return attachment;
    } catch (error) {
      await this.supabase.admin.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .remove([storagePath]);

      throw error;
    }
  }

  async getAttachmentDownload(
    taskId: string,
    attachmentId: string,
  ) {
    await this.ensureTask(taskId);

    const attachment =
      await this.tasks.findAttachment(
        taskId,
        attachmentId,
      );

    if (
      !attachment ||
      !attachment.storage_path
    ) {
      throw new NotFoundException(
        'Attachment not found',
      );
    }

    const signed =
      await this.supabase.admin.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .createSignedUrl(
          attachment.storage_path,
          60 * 5,
          {
            download:
              attachment.file_name,
          },
        );

    if (
      signed.error ||
      !signed.data?.signedUrl
    ) {
      throw new BadRequestException(
        signed.error?.message ??
          'Unable to create download link',
      );
    }

    return {
      attachmentId:
        attachment.id,
      fileName:
        attachment.file_name,
      mimeType:
        attachment.mime_type,
      fileSize:
        attachment.file_size,
      expiresInSeconds: 300,
      signedUrl:
        signed.data.signedUrl,
    };
  }

  async deleteAttachment(
    taskId: string,
    attachmentId: string,
    context?: ActionContext,
  ) {
    await this.ensureTask(taskId);

    const attachment =
      await this.tasks.findAttachment(
        taskId,
        attachmentId,
      );

    if (!attachment) {
      throw new NotFoundException(
        'Attachment not found',
      );
    }

    if (attachment.storage_path) {
      const removed =
        await this.supabase.admin.storage
          .from(TASK_ATTACHMENTS_BUCKET)
          .remove([
            attachment.storage_path,
          ]);

      if (removed.error) {
        throw new BadRequestException(
          `Unable to delete attachment: ${removed.error.message}`,
        );
      }
    }

    await this.tasks.deleteAttachment(
      taskId,
      attachmentId,
    );

    await this.audit.log({
      actorUserId:
        context?.actorUserId,
      action:
        'TASK_ATTACHMENT_DELETED',
      module: 'tasks',
      entityType:
        'task_attachment',
      entityId: attachmentId,
      oldValues: {
        taskId,
        fileName:
          attachment.file_name,
        mimeType:
          attachment.mime_type,
        fileSize:
          attachment.file_size,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      id: attachmentId,
      deleted: true,
    };
  }

  private async ensureTask(
    taskId: string,
  ) {
    const task =
      await this.tasks.findById(
        taskId,
      );

    if (!task) {
      throw new NotFoundException(
        'Task not found',
      );
    }

    return task;
  }

  private safeFileName(
    name: string,
  ) {
    const cleaned = name
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return (
      cleaned.slice(0, 140) ||
      'attachment'
    );
  }

  private async validate(
    body: Partial<TaskInput>,
  ): Promise<TaskInput> {
    const title =
      body.title?.trim();

    if (!title) {
      throw new BadRequestException(
        'Task title is required',
      );
    }

    const status =
      (body.status ??
        'TODO') as TaskStatus;

    const priority =
      (body.priority ??
        'MEDIUM') as TaskPriority;

    const statuses: TaskStatus[] = [
      'TODO',
      'IN_PROGRESS',
      'AWAITING_RESPONSE',
      'BLOCKED',
      'COMPLETED',
      'CANCELLED',
    ];

    const priorities: TaskPriority[] = [
      'LOW',
      'MEDIUM',
      'HIGH',
      'URGENT',
    ];

    if (!statuses.includes(status)) {
      throw new BadRequestException(
        'Invalid task status',
      );
    }

    if (
      !priorities.includes(priority)
    ) {
      throw new BadRequestException(
        'Invalid task priority',
      );
    }

    const organizationId =
      this.clean(
        body.organizationId,
      );
    const leadId =
      this.clean(body.leadId);
    const contactId =
      this.clean(body.contactId);
    const assignedToId =
      this.clean(
        body.assignedToId,
      );

    if (
      organizationId &&
      !(await this.tasks.entityExists(
        'organizations',
        organizationId,
      ))
    ) {
      throw new BadRequestException(
        'Invalid organization',
      );
    }

    if (
      leadId &&
      !(await this.tasks.entityExists(
        'leads',
        leadId,
      ))
    ) {
      throw new BadRequestException(
        'Invalid lead',
      );
    }

    if (
      contactId &&
      !(await this.tasks.entityExists(
        'contacts',
        contactId,
      ))
    ) {
      throw new BadRequestException(
        'Invalid contact',
      );
    }

    if (
      assignedToId &&
      !(await this.tasks.entityExists(
        'users',
        assignedToId,
      ))
    ) {
      throw new BadRequestException(
        'Invalid assignee',
      );
    }

    if (
      leadId &&
      organizationId &&
      !(await this.tasks
        .leadBelongsToOrganization(
          leadId,
          organizationId,
        ))
    ) {
      throw new BadRequestException(
        'Lead must belong to the selected organization',
      );
    }

    if (
      contactId &&
      organizationId &&
      !(await this.tasks
        .contactBelongsToOrganization(
          contactId,
          organizationId,
        ))
    ) {
      throw new BadRequestException(
        'Contact must belong to the selected organization',
      );
    }

    return {
      title,
      description:
        this.clean(
          body.description,
        ),
      organizationId,
      leadId,
      contactId,
      assignedToId,
      status,
      priority,
      startAt:
        this.clean(body.startAt),
      dueAt:
        this.clean(body.dueAt),
    };
  }

  private clean(
    value:
      | string
      | null
      | undefined,
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    return value.trim() || null;
  }
}
