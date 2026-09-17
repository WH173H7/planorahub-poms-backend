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
  type TaskAssignmentType,
  type TaskControlState,
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

export type UploadedTaskFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type TaskDetail = TaskRow & {
  events: Awaited<ReturnType<TasksRepository['events']>>;
  attachments: TaskAttachmentRow[];
  lead_assignment_batch: Awaited<ReturnType<TasksRepository['leadAssignmentForTask']>>;
  task_workflow: Awaited<ReturnType<TasksRepository['workflowForTask']>>;
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
    const rows = await this.tasks.list();
    return Promise.all(
      rows.map(async (task) => ({
        ...task,
        lead_assignment_batch: await this.tasks.leadAssignmentForTask(task.id),
      })),
    );
  }

  async listOwned(userId: string) {
    const rows = await this.tasks.listOwned(userId);
    return Promise.all(
      rows.map(async (task) => ({
        ...task,
        lead_assignment_batch: await this.tasks.leadAssignmentForTask(task.id),
      })),
    );
  }

  async getOwned(id: string, userId: string) {
    const task = await this.tasks.findOwnedById(id, userId);
    if (!task) throw new NotFoundException('Task not found');
    const [events, attachments, leadAssignmentBatch, taskWorkflow] = await Promise.all([
      this.tasks.events(id),
      this.tasks.listAttachments(id),
      this.tasks.leadAssignmentForTask(id),
      this.tasks.workflowForTask(id),
    ]);
    return { ...task, events, attachments, lead_assignment_batch: leadAssignmentBatch, task_workflow: taskWorkflow };
  }

  async updateOwned(id:string,body:Partial<TaskInput>,userId:string,context?:ActionContext){
    await this.getOwned(id,userId);
    const keys=Object.keys(body).filter((key)=>body[key as keyof TaskInput]!==undefined);
    if(keys.some((key)=>key!=='status')) throw new BadRequestException('Assigned staff cannot change the task brief, assignee, priority or deadline. Ask an Admin to update the task.');
    if(body.status && !['TODO','IN_PROGRESS','BLOCKED'].includes(body.status)) throw new BadRequestException('Use Accept, Start and Submit for Review to progress this task.');
    return this.update(id,{status:body.status},context);
  }

  async createOwnedForLead(leadId:string,body:Partial<TaskInput>,userId:string,context?:ActionContext){
    const lead=await this.tasks.ownedLeadContext(leadId,userId);
    if(!lead)throw new NotFoundException('Lead not found');
    return this.create({...body,leadId,organizationId:lead.organization_id,assignedToId:userId,assignmentType:'STAFF'},context);
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

    const [events, attachments, leadAssignmentBatch, taskWorkflow] =
      await Promise.all([
        this.tasks.events(id),
        this.tasks.listAttachments(id),
        this.tasks.leadAssignmentForTask(id),
        this.tasks.workflowForTask(id),
      ]);

    return {
      ...task,
      events,
      attachments,
      lead_assignment_batch: leadAssignmentBatch,
      task_workflow: taskWorkflow,
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

      if (task.assignment_type !== 'UNASSIGNED') {
        await this.tasks.addEvent({
          taskId: task.id,
          actorUserId: context?.actorUserId,
          eventType: 'TASK_ASSIGNED',
          message: task.control_state === 'SCHEDULED'
            ? `Task scheduled for ${task.scheduled_for}`
            : 'Task assigned — awaiting acceptance',
          newValues: {
            assignmentType: task.assignment_type,
            assignedToId: task.assigned_to_id,
            assignedTeamId: task.assigned_team_id,
            assignedDepartmentId: task.assigned_department_id,
            scheduledFor: task.scheduled_for,
          },
        });
      }
      if (task.assignment_type !== 'UNASSIGNED' && task.control_state === 'ACTIVE') {
        await this.tasks.notifyRecipients(task,'New task assigned',task.title);
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

    if (current.lead_assignment_batch) {
      const requestedKeys = Object.keys(body).filter((key) => body[key as keyof TaskInput] !== undefined);
      const disallowedKeys = requestedKeys.filter((key) => key !== 'status');
      if (disallowedKeys.length > 0) {
        throw new BadRequestException(
          'Assignment-generated tasks are managed through the Lead assignment workflow. Only status may be updated here.',
        );
      }
    }

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
        taskWorkflowId:
          body.taskWorkflowId === undefined
            ? current.task_workflow_id
            : body.taskWorkflowId,
        assignmentType:
          body.assignmentType === undefined
            ? current.assignment_type
            : body.assignmentType,
        assignedTeamId:
          body.assignedTeamId === undefined
            ? current.assigned_team_id
            : body.assignedTeamId,
        assignedDepartmentId:
          body.assignedDepartmentId === undefined
            ? current.assigned_department_id
            : body.assignedDepartmentId,
        scheduledFor:
          body.scheduledFor === undefined
            ? current.scheduled_for
            : body.scheduledFor,
        controlState:
          body.controlState === undefined
            ? current.control_state
            : body.controlState,
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

    if (!(await this.tasks.canUserWorkOnTask(id, actorUserId))) {
      throw new BadRequestException('This task is not currently assigned to you, your Team or your Department');
    }
    if (current.control_state !== 'ACTIVE') {
      throw new BadRequestException('This task is not active');
    }
    if (current.accepted_by_id && current.accepted_by_id !== actorUserId) {
      throw new BadRequestException('Another eligible staff member has already accepted this shared task');
    }
    if (current.accepted_at && current.accepted_by_id === actorUserId) {
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

    if (!(await this.tasks.canUserWorkOnTask(id, actorUserId))) {
      throw new BadRequestException('This task is not currently assigned to you, your Team or your Department');
    }
    if (current.accepted_by_id && current.accepted_by_id !== actorUserId) {
      throw new BadRequestException('Another eligible staff member has already accepted this shared task');
    }
    if (current.control_state !== 'ACTIVE') {
      throw new BadRequestException('This task is not active');
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


  async submitForReview(id:string,context?:ActionContext){
    const current=await this.ensureTask(id);
    const actor=context?.actorUserId;
    if(!actor||!(await this.tasks.canUserWorkOnTask(id,actor))) throw new BadRequestException('This task is not assigned to you, your Team or your Department');
    if(!current.accepted_at||current.accepted_by_id!==actor) throw new BadRequestException('Accept the task before submitting work');
    if(current.control_state!=='ACTIVE') throw new BadRequestException('This task is not active');
    if(current.status==='COMPLETED'||current.status==='CANCELLED') throw new BadRequestException('This task cannot be submitted');
    const updated=await this.tasks.update(id,{title:current.title,description:current.description,organizationId:current.organization_id,leadId:current.lead_id,contactId:current.contact_id,assignedToId:current.assigned_to_id,status:'AWAITING_RESPONSE',priority:current.priority,startAt:current.start_at,dueAt:current.due_at,taskWorkflowId:current.task_workflow_id,assignmentType:current.assignment_type,assignedTeamId:current.assigned_team_id,assignedDepartmentId:current.assigned_department_id,scheduledFor:current.scheduled_for,controlState:current.control_state});
    if(!updated) throw new NotFoundException('Task not found');
    await this.tasks.addEvent({taskId:id,actorUserId:actor,eventType:'STATUS_CHANGED',message:'Work submitted for admin review',oldValues:{status:current.status},newValues:{status:'AWAITING_RESPONSE'}});
    await this.tasks.notifyAdmins('Task submitted for review',current.title,id);
    await this.audit.log({actorUserId:actor,action:'TASK_SUBMITTED_FOR_REVIEW',module:'tasks',entityType:'task',entityId:id,oldValues:{status:current.status},newValues:{status:'AWAITING_RESPONSE'},ipAddress:context?.ipAddress,userAgent:context?.userAgent});
    return this.get(id);
  }

  async reviewSubmission(id:string,decision:'APPROVE'|'REVISION',message:string|undefined,context?:ActionContext){
    const current=await this.ensureTask(id);
    if(current.status!=='AWAITING_RESPONSE') throw new BadRequestException('Only submitted tasks can be reviewed');
    const status:TaskStatus=decision==='APPROVE'?'COMPLETED':'BLOCKED';
    const updated=await this.tasks.update(id,{title:current.title,description:current.description,organizationId:current.organization_id,leadId:current.lead_id,contactId:current.contact_id,assignedToId:current.assigned_to_id,status,priority:current.priority,startAt:current.start_at,dueAt:current.due_at,taskWorkflowId:current.task_workflow_id,assignmentType:current.assignment_type,assignedTeamId:current.assigned_team_id,assignedDepartmentId:current.assigned_department_id,scheduledFor:current.scheduled_for,controlState:current.control_state});
    if(!updated) throw new NotFoundException('Task not found');
    const clean=message?.trim();
    await this.tasks.addEvent({taskId:id,actorUserId:context?.actorUserId,eventType:decision==='APPROVE'?'TASK_COMPLETED':'STATUS_CHANGED',message:decision==='APPROVE'?(clean||'Task approved and completed'):(clean?`Revision requested: ${clean}`:'Revision requested'),oldValues:{status:current.status},newValues:{status}});
    await this.tasks.notifyRecipients(updated,decision==='APPROVE'?'Task approved':'Task revision requested',clean||updated.title);
    await this.audit.log({actorUserId:context?.actorUserId,action:decision==='APPROVE'?'TASK_APPROVED':'TASK_REVISION_REQUESTED',module:'tasks',entityType:'task',entityId:id,oldValues:{status:current.status},newValues:{status,message:clean??null},ipAddress:context?.ipAddress,userAgent:context?.userAgent});
    return this.get(id);
  }
  async controlTask(id:string,action:'PAUSE'|'RESUME'|'CANCEL'|'COMPLETE'|'REOPEN'|'DISPATCH_NOW',context?:ActionContext){
    const current=await this.ensureTask(id);
    const allowed:Record<string,string[]>={
      PAUSE:['ACTIVE'],RESUME:['PAUSED'],CANCEL:['ACTIVE','PAUSED','SCHEDULED'],COMPLETE:['ACTIVE','PAUSED'],REOPEN:['ACTIVE','CANCELLED'],DISPATCH_NOW:['SCHEDULED'],
    };
    if(!allowed[action]?.includes(current.control_state)){
      if(action==='REOPEN'&&current.status==='COMPLETED'){}else throw new BadRequestException(`Task cannot be ${action.toLowerCase().replaceAll('_',' ')} from its current state`);
    }
    const updated=await this.tasks.control(id,action);
    if(!updated)throw new NotFoundException('Task not found');
    const labels:Record<string,string>={PAUSE:'Task paused by Admin',RESUME:'Task resumed by Admin',CANCEL:'Task cancelled by Admin',COMPLETE:'Task marked completed by Admin',REOPEN:'Task reopened by Admin',DISPATCH_NOW:'Scheduled task dispatched now'};
    await this.tasks.addEvent({taskId:id,actorUserId:context?.actorUserId,eventType:action==='COMPLETE'?'TASK_COMPLETED':action==='REOPEN'?'TASK_REOPENED':'STATUS_CHANGED',message:labels[action],oldValues:{status:current.status,controlState:current.control_state},newValues:{status:updated.status,controlState:updated.control_state}});
    await this.tasks.notifyRecipients(updated,labels[action],updated.title);
    await this.audit.log({actorUserId:context?.actorUserId,action:`TASK_${action}`,module:'tasks',entityType:'task',entityId:id,oldValues:{status:current.status,controlState:current.control_state},newValues:{status:updated.status,controlState:updated.control_state},ipAddress:context?.ipAddress,userAgent:context?.userAgent});
    return this.get(id);
  }

  async deleteTask(
    id: string,
    context?: ActionContext,
  ) {
    const task = await this.get(id);

    if (task.lead_assignment_batch) {
      throw new BadRequestException(
        'Assignment-generated tasks cannot be deleted. Manage the underlying Lead assignment instead.',
      );
    }

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
        'Attachment upload failed. Please try again.',
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
    context?: ActionContext,
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
        'Unable to create download link',
      );
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'TASK_ATTACHMENT_DOWNLOADED',
      module: 'tasks',
      entityType: 'task_attachment',
      entityId: attachment.id,
      newValues: {
        taskId,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        fileSize: attachment.file_size,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

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
          'Unable to delete attachment. Please try again.',
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

  async toggleWorkflowStep(taskId:string,stepId:string,completed:boolean,context?:ActionContext,requireAccountableWorker=false){
    const task=await this.ensureTask(taskId);
    if(!task.task_workflow_id) throw new BadRequestException('This task does not use a workflow guide');
    if(!context?.actorUserId) throw new BadRequestException('Authenticated user is required');
    if(task.control_state!=='ACTIVE')throw new BadRequestException('Workflow steps can only be updated while the task is active');
    if(requireAccountableWorker){
      if(!(await this.tasks.canUserWorkOnTask(taskId,context.actorUserId)))throw new BadRequestException('This task is not assigned to you, your Team or your Department');
      if(task.accepted_by_id&&task.accepted_by_id!==context.actorUserId)throw new BadRequestException('Another staff member is accountable for this shared task');
    }
    const ok=await this.tasks.toggleWorkflowStep(taskId,stepId,context.actorUserId,completed);
    if(!ok) throw new BadRequestException('Workflow step does not belong to this task');
    await this.audit.log({actorUserId:context.actorUserId,action:completed?'TASK_WORKFLOW_STEP_COMPLETED':'TASK_WORKFLOW_STEP_REOPENED',module:'tasks',entityType:'task',entityId:taskId,newValues:{stepId,completed},ipAddress:context.ipAddress,userAgent:context.userAgent});
    return this.get(taskId);
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

  private async validate(body:Partial<TaskInput>):Promise<TaskInput>{
    const title=body.title?.trim();
    if(!title)throw new BadRequestException('Task title is required');
    const status=(body.status??'TODO') as TaskStatus;
    const priority=(body.priority??'MEDIUM') as TaskPriority;
    const statuses:TaskStatus[]=['TODO','IN_PROGRESS','AWAITING_RESPONSE','BLOCKED','COMPLETED','CANCELLED'];
    const priorities:TaskPriority[]=['LOW','MEDIUM','HIGH','URGENT'];
    if(!statuses.includes(status))throw new BadRequestException('Invalid task status');
    if(!priorities.includes(priority))throw new BadRequestException('Invalid task priority');

    const organizationId=this.clean(body.organizationId);
    const leadId=this.clean(body.leadId);
    const contactId=this.clean(body.contactId);
    const assignedToId=this.clean(body.assignedToId);
    const assignedTeamId=this.clean(body.assignedTeamId);
    const assignedDepartmentId=this.clean(body.assignedDepartmentId);
    const taskWorkflowId=this.clean(body.taskWorkflowId);
    const assignmentType=(body.assignmentType??(assignedToId?'STAFF':assignedTeamId?'TEAM':assignedDepartmentId?'DEPARTMENT':'UNASSIGNED')) as TaskAssignmentType;
    if(!['UNASSIGNED','STAFF','TEAM','DEPARTMENT'].includes(assignmentType))throw new BadRequestException('Invalid assignment type');

    if(organizationId&&!(await this.tasks.entityExists('organizations',organizationId)))throw new BadRequestException('Invalid organization');
    if(leadId&&!(await this.tasks.entityExists('leads',leadId)))throw new BadRequestException('Invalid lead');
    if(contactId&&!(await this.tasks.entityExists('contacts',contactId)))throw new BadRequestException('Invalid contact');
    if(assignedToId&&!(await this.tasks.entityExists('users',assignedToId)))throw new BadRequestException('Invalid assignee');
    if(assignedTeamId&&!(await this.tasks.entityExists('teams' as any,assignedTeamId)))throw new BadRequestException('Invalid team');
    if(assignedDepartmentId&&!(await this.tasks.entityExists('departments' as any,assignedDepartmentId)))throw new BadRequestException('Invalid department');
    if(taskWorkflowId&&!(await this.tasks.entityExists('task_workflows',taskWorkflowId)))throw new BadRequestException('Invalid task workflow');

    if(assignmentType==='STAFF'&&!assignedToId)throw new BadRequestException('Choose the staff member who should receive this task');
    if(assignmentType==='TEAM'&&!assignedTeamId)throw new BadRequestException('Choose the Team that should receive this task');
    if(assignmentType==='DEPARTMENT'&&!assignedDepartmentId)throw new BadRequestException('Choose the Department that should receive this task');
    if(assignmentType==='UNASSIGNED'&&(assignedToId||assignedTeamId||assignedDepartmentId))throw new BadRequestException('Unassigned tasks cannot include an assignment target');

    if(leadId&&organizationId&&!(await this.tasks.leadBelongsToOrganization(leadId,organizationId)))throw new BadRequestException('Lead must belong to the selected organization');
    if(contactId&&organizationId&&!(await this.tasks.contactBelongsToOrganization(contactId,organizationId)))throw new BadRequestException('Contact must belong to the selected organization');

    if(taskWorkflowId){
      const workflow=await this.tasks.workflowMeta(taskWorkflowId);
      if(!workflow||!workflow.is_active)throw new BadRequestException('Selected task workflow is not active');
      if(workflow.scope_type==='ROLE'){
        if(assignmentType!=='STAFF'||!assignedToId)throw new BadRequestException('This workflow is reserved for a staff role');
        const meta=await this.tasks.assignmentMeta(assignedToId);
        if(!meta||meta.role_id!==workflow.role_id)throw new BadRequestException('The selected workflow does not match this staff member’s role');
      }
      if(workflow.scope_type==='TEAM'&&(assignmentType!=='TEAM'||workflow.team_id!==assignedTeamId))throw new BadRequestException('The selected workflow does not match the selected Team');
      if(workflow.scope_type==='DEPARTMENT'&&(assignmentType!=='DEPARTMENT'||workflow.department_id!==assignedDepartmentId))throw new BadRequestException('The selected workflow does not match the selected Department');
    }

    const scheduledFor=this.clean(body.scheduledFor);
    const dueAt=this.clean(body.dueAt);
    if(dueAt&&Number.isNaN(new Date(dueAt).getTime()))throw new BadRequestException('Invalid due date');
    let controlState=(body.controlState??(scheduledFor&&new Date(scheduledFor).getTime()>Date.now()?'SCHEDULED':'ACTIVE')) as TaskControlState;
    if(!['ACTIVE','SCHEDULED','PAUSED','CANCELLED'].includes(controlState))throw new BadRequestException('Invalid task control state');
    if(scheduledFor){
      const ms=new Date(scheduledFor).getTime();
      if(Number.isNaN(ms))throw new BadRequestException('Invalid scheduled dispatch time');
      if(assignmentType==='UNASSIGNED')throw new BadRequestException('A scheduled task must be assigned to Staff, a Team or a Department');
      if(ms>Date.now())controlState='SCHEDULED';
      else if(controlState==='SCHEDULED')controlState='ACTIVE';
      if(dueAt){
        const dueMs=new Date(dueAt).getTime();
        if(Number.isNaN(dueMs))throw new BadRequestException('Invalid due date');
        if(dueMs<=ms)throw new BadRequestException('Due date must be after the scheduled dispatch time');
      }
    }

    return{
      title,
      description:this.clean(body.description),
      organizationId,leadId,contactId,
      assignedToId:assignmentType==='STAFF'?assignedToId:null,
      assignedTeamId:assignmentType==='TEAM'?assignedTeamId:null,
      assignedDepartmentId:assignmentType==='DEPARTMENT'?assignedDepartmentId:null,
      assignmentType,status,priority,
      startAt:this.clean(body.startAt),dueAt,taskWorkflowId,
      scheduledFor,controlState,
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
