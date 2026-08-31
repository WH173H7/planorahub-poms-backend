import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export type TaskStatus =

  | 'TODO'

  | 'IN_PROGRESS'

  | 'AWAITING_RESPONSE'

  | 'BLOCKED'

  | 'COMPLETED'

  | 'CANCELLED';

export type TaskPriority =

  | 'LOW'

  | 'MEDIUM'

  | 'HIGH'

  | 'URGENT';

export type TaskEventType =

  | 'TASK_CREATED'

  | 'TASK_ASSIGNED'

  | 'STATUS_CHANGED'

  | 'COMMENT_ADDED'

  | 'REPLY_ADDED'

  | 'FILE_UPLOADED'

  | 'DUE_DATE_CHANGED'

  | 'PRIORITY_CHANGED'

  | 'ASSIGNEE_CHANGED'

  | 'TASK_COMPLETED'

  | 'TASK_REOPENED';

export type TaskInput = {

  title: string;

  description?: string | null;

  organizationId?: string | null;

  leadId?: string | null;

  contactId?: string | null;

  assignedToId?: string | null;

  status?: TaskStatus;

  priority?: TaskPriority;

  startAt?: string | null;

  dueAt?: string | null;

};

export type TaskRow = {

  id: string;

  title: string;

  description: string | null;

  organization_id: string | null;

  organization_name: string | null;

  lead_id: string | null;

  lead_title: string | null;

  contact_id: string | null;

  contact_first_name: string | null;

  contact_last_name: string | null;

  assigned_to_id: string | null;

  assignee_first_name: string | null;

  assignee_last_name: string | null;

  assignee_email?: string | null;

  created_by_id: string | null;

  creator_first_name: string | null;

  creator_last_name: string | null;

  status: TaskStatus;

  priority: TaskPriority;

  start_at: string | null;

  due_at: string | null;

  completed_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  accepted_by_id: string | null;
  accepted_by_first_name: string | null;
  accepted_by_last_name: string | null;

  created_at: string;

  updated_at: string;

};

export type TaskEventRow = {

  id: string;

  task_id: string;

  actor_user_id: string | null;

  event_type: TaskEventType;

  message: string | null;

  old_values: unknown | null;

  new_values: unknown | null;

  parent_event_id: string | null;

  created_at: string;

  actor_first_name: string | null;

  actor_last_name: string | null;

  actor_email: string | null;

};


export type LeadAssignmentTaskBatch = {
  id: string;
  title: string;
  instructions: string;
  assigned_to_id: string;
  assigned_by_id: string | null;
  priority: TaskPriority;
  due_at: string;
  task_id: string | null;
  created_at: string;
  items: Array<{
    id: string;
    lead_id: string;
    organization_id: string;
    organization_name: string;
    stage: string;
    pursuit_progress: number;
    priority: string;
    previous_owner_id: string | null;
  }>;
};

export type TaskAttachmentRow = {

  id: string;

  task_id: string;

  event_id: string | null;

  uploaded_by_id: string | null;

  file_name: string;

  file_url: string | null;

  storage_path: string | null;

  mime_type: string | null;

  file_size: number | null;

  created_at: string;

  uploader_first_name: string | null;

  uploader_last_name: string | null;

};

@Injectable()

export class TasksRepository {

  constructor(

    private readonly db: DatabaseService,

  ) {}

  async list(): Promise<TaskRow[]> {

    const result = await this.db.query(`

      SELECT

        t.*,

        o.name AS organization_name,

        l.title AS lead_title,

        c.first_name AS contact_first_name,

        c.last_name AS contact_last_name,

        assignee.first_name AS assignee_first_name,

        assignee.last_name AS assignee_last_name,

        creator.first_name AS creator_first_name,
        creator.last_name AS creator_last_name,
        accepted_by.first_name AS accepted_by_first_name,
        accepted_by.last_name AS accepted_by_last_name

      FROM tasks t

      LEFT JOIN organizations o

        ON o.id = t.organization_id

      LEFT JOIN leads l

        ON l.id = t.lead_id

      LEFT JOIN contacts c

        ON c.id = t.contact_id

      LEFT JOIN users assignee

        ON assignee.id = t.assigned_to_id

      LEFT JOIN users creator
        ON creator.id = t.created_by_id
      LEFT JOIN users accepted_by
        ON accepted_by.id = t.accepted_by_id

      ORDER BY

        CASE

          WHEN t.status IN ('COMPLETED','CANCELLED')

            THEN 1

          ELSE 0

        END,

        t.due_at NULLS LAST,

        t.created_at DESC

    `);

    return result.rows as TaskRow[];

  }

  async findById(

    id: string,

  ): Promise<TaskRow | null> {

    const result = await this.db.query(

      `

        SELECT

          t.*,

          o.name AS organization_name,

          l.title AS lead_title,

          c.first_name AS contact_first_name,

          c.last_name AS contact_last_name,

          assignee.first_name AS assignee_first_name,

          assignee.last_name AS assignee_last_name,

          assignee.email AS assignee_email,

          creator.first_name AS creator_first_name,
          creator.last_name AS creator_last_name,
          accepted_by.first_name AS accepted_by_first_name,
          accepted_by.last_name AS accepted_by_last_name

        FROM tasks t

        LEFT JOIN organizations o

          ON o.id = t.organization_id

        LEFT JOIN leads l

          ON l.id = t.lead_id

        LEFT JOIN contacts c

          ON c.id = t.contact_id

        LEFT JOIN users assignee

          ON assignee.id = t.assigned_to_id

        LEFT JOIN users creator
          ON creator.id = t.created_by_id
        LEFT JOIN users accepted_by
          ON accepted_by.id = t.accepted_by_id

        WHERE t.id = $1

        LIMIT 1

      `,

      [id],

    );

    return (

      (result.rows[0] as TaskRow | undefined) ??

      null

    );

  }

  async events(

    taskId: string,

  ): Promise<TaskEventRow[]> {

    const result = await this.db.query(

      `

        SELECT

          e.*,

          actor.first_name AS actor_first_name,

          actor.last_name AS actor_last_name,

          actor.email AS actor_email

        FROM task_events e

        LEFT JOIN users actor

          ON actor.id = e.actor_user_id

        WHERE e.task_id = $1

        ORDER BY e.created_at ASC

      `,

      [taskId],

    );

    return result.rows as TaskEventRow[];

  }

  async entityExists(

    table:

      | 'organizations'

      | 'leads'

      | 'contacts'

      | 'users',

    id: string,

  ) {

    const result = await this.db.query(

      `SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`,

      [id],

    );

    return result.rowCount === 1;

  }

  async leadBelongsToOrganization(

    leadId: string,

    organizationId: string,

  ) {

    const result = await this.db.query(

      `

        SELECT 1

        FROM leads

        WHERE id = $1

          AND organization_id = $2

        LIMIT 1

      `,

      [leadId, organizationId],

    );

    return result.rowCount === 1;

  }

  async contactBelongsToOrganization(

    contactId: string,

    organizationId: string,

  ) {

    const result = await this.db.query(

      `

        SELECT 1

        FROM contacts

        WHERE id = $1

          AND organization_id = $2

        LIMIT 1

      `,

      [contactId, organizationId],

    );

    return result.rowCount === 1;

  }

  async create(

    input: TaskInput,

    createdById?: string,

  ): Promise<TaskRow> {

    const result = await this.db.query(

      `

        INSERT INTO tasks (

          title,

          description,

          organization_id,

          lead_id,

          contact_id,

          assigned_to_id,

          created_by_id,

          status,

          priority,

          start_at,

          due_at,

          completed_at

        )

        VALUES (

          $1,$2,$3,$4,$5,$6,$7,$8::task_status,$9::task_priority,$10,$11,
          CASE

            WHEN $8::task_status = 'COMPLETED'::task_status

              THEN NOW()

            ELSE NULL

          END

        )

        RETURNING *

      `,

      [

        input.title,

        input.description ?? null,

        input.organizationId ?? null,

        input.leadId ?? null,

        input.contactId ?? null,

        input.assignedToId ?? null,

        createdById ?? null,

        input.status ?? 'TODO',

        input.priority ?? 'MEDIUM',

        input.startAt ?? null,

        input.dueAt ?? null,

      ],

    );

    return result.rows[0] as TaskRow;

  }

  async update(

    id: string,

    input: TaskInput,

  ): Promise<TaskRow | null> {

    const result = await this.db.query(

      `

        UPDATE tasks

        SET

          title = $2,

          description = $3,

          organization_id = $4,

          lead_id = $5,

          contact_id = $6,

          assigned_to_id = $7,

          status = $8::task_status,
          priority = $9::task_priority,

          start_at = $10,

          due_at = $11,

          completed_at = CASE

            WHEN $8::task_status = 'COMPLETED'::task_status

              AND completed_at IS NULL

              THEN NOW()

            WHEN $8::task_status <> 'COMPLETED'::task_status

              THEN NULL

            ELSE completed_at

          END,

          updated_at = NOW()

        WHERE id = $1

        RETURNING *

      `,

      [

        id,

        input.title,

        input.description ?? null,

        input.organizationId ?? null,

        input.leadId ?? null,

        input.contactId ?? null,

        input.assignedToId ?? null,

        input.status ?? 'TODO',

        input.priority ?? 'MEDIUM',

        input.startAt ?? null,

        input.dueAt ?? null,

      ],

    );

    return (

      (result.rows[0] as TaskRow | undefined) ??

      null

    );

  }

  async accept(
    id: string,
    actorUserId: string,
  ): Promise<TaskRow | null> {
    const result = await this.db.query(
      `
        UPDATE tasks
        SET
          accepted_at = COALESCE(accepted_at, NOW()),
          accepted_by_id = COALESCE(accepted_by_id, $2::uuid),
          updated_at = NOW()
        WHERE id = $1::uuid
          AND assigned_to_id = $2::uuid
          AND status NOT IN ('COMPLETED','CANCELLED')
        RETURNING *
      `,
      [id, actorUserId],
    );

    return (result.rows[0] as TaskRow | undefined) ?? null;
  }

  async start(
    id: string,
    actorUserId: string,
  ): Promise<TaskRow | null> {
    const result = await this.db.query(
      `
        UPDATE tasks
        SET
          accepted_at = COALESCE(accepted_at, NOW()),
          accepted_by_id = COALESCE(accepted_by_id, $2::uuid),
          started_at = COALESCE(started_at, NOW()),
          start_at = COALESCE(start_at, NOW()),
          status = 'IN_PROGRESS'::task_status,
          updated_at = NOW()
        WHERE id = $1::uuid
          AND assigned_to_id = $2::uuid
          AND status NOT IN ('COMPLETED','CANCELLED')
        RETURNING *
      `,
      [id, actorUserId],
    );

    return (result.rows[0] as TaskRow | undefined) ?? null;
  }

  async deleteTask(
    id: string,
  ): Promise<TaskRow | null> {
    const result = await this.db.query(
      `
        DELETE FROM tasks
        WHERE id = $1::uuid
        RETURNING *
      `,
      [id],
    );

    return (result.rows[0] as TaskRow | undefined) ?? null;
  }

  async addEvent(input: {

    taskId: string;

    actorUserId?: string;

    eventType: TaskEventType;

    message?: string | null;

    oldValues?: unknown;

    newValues?: unknown;

    parentEventId?: string | null;

  }): Promise<TaskEventRow> {

    const result = await this.db.query(

      `

        INSERT INTO task_events (

          task_id,

          actor_user_id,

          event_type,

          message,

          old_values,

          new_values,

          parent_event_id

        )

        VALUES ($1,$2,$3,$4,$5,$6,$7)

        RETURNING *

      `,

      [

        input.taskId,

        input.actorUserId ?? null,

        input.eventType,

        input.message ?? null,

        input.oldValues === undefined

          ? null

          : JSON.stringify(input.oldValues),

        input.newValues === undefined

          ? null

          : JSON.stringify(input.newValues),

        input.parentEventId ?? null,

      ],

    );

    return result.rows[0] as TaskEventRow;

  }

  async listAttachments(

    taskId: string,

  ): Promise<TaskAttachmentRow[]> {

    const result = await this.db.query(

      `

        SELECT

          a.*,

          uploader.first_name AS uploader_first_name,

          uploader.last_name AS uploader_last_name

        FROM task_attachments a

        LEFT JOIN users uploader

          ON uploader.id = a.uploaded_by_id

        WHERE a.task_id = $1

        ORDER BY a.created_at DESC

      `,

      [taskId],

    );

    return result.rows as TaskAttachmentRow[];

  }

  async findAttachment(

    taskId: string,

    attachmentId: string,

  ): Promise<TaskAttachmentRow | null> {

    const result = await this.db.query(

      `

        SELECT

          a.*,

          uploader.first_name AS uploader_first_name,

          uploader.last_name AS uploader_last_name

        FROM task_attachments a

        LEFT JOIN users uploader

          ON uploader.id = a.uploaded_by_id

        WHERE a.task_id = $1

          AND a.id = $2

        LIMIT 1

      `,

      [taskId, attachmentId],

    );

    return (

      (result.rows[0] as TaskAttachmentRow | undefined) ??

      null

    );

  }

  async createAttachment(input: {

    taskId: string;

    eventId: string | null;

    uploadedById?: string;

    fileName: string;

    storagePath: string;

    mimeType: string;

    fileSize: number;

  }): Promise<TaskAttachmentRow> {

    const result = await this.db.query(

      `

        INSERT INTO task_attachments (

          task_id,

          event_id,

          uploaded_by_id,

          file_name,

          file_url,

          storage_path,

          mime_type,

          file_size

        )

        VALUES ($1,$2,$3,$4,NULL,$5,$6,$7)

        RETURNING *

      `,

      [

        input.taskId,

        input.eventId,

        input.uploadedById ?? null,

        input.fileName,

        input.storagePath,

        input.mimeType,

        input.fileSize,

      ],

    );

    return result.rows[0] as TaskAttachmentRow;

  }

  async deleteAttachment(

    taskId: string,

    attachmentId: string,

  ) {

    const result = await this.db.query(

      `

        DELETE FROM task_attachments

        WHERE task_id = $1

          AND id = $2

        RETURNING *

      `,

      [taskId, attachmentId],

    );

    return (

      (result.rows[0] as TaskAttachmentRow | undefined) ??

      null

    );

  }


  async leadAssignmentForTask(
    taskId: string,
  ): Promise<LeadAssignmentTaskBatch | null> {
    const batchResult = await this.db.query(
      `
        SELECT
          lab.id,
          lab.title,
          lab.instructions,
          lab.assigned_to_id,
          lab.assigned_by_id,
          lab.priority,
          lab.due_at,
          lab.task_id,
          lab.created_at
        FROM lead_assignment_batches lab
        WHERE lab.task_id = $1
        LIMIT 1
      `,
      [taskId],
    );

    const batch =
      batchResult.rows[0] as
        | Omit<LeadAssignmentTaskBatch, 'items'>
        | undefined;

    if (!batch) {
      return null;
    }

    const itemsResult = await this.db.query(
      `
        SELECT
          labi.id,
          labi.lead_id,
          labi.previous_owner_id,
          l.organization_id,
          l.stage,
          l.pursuit_progress,
          l.priority,
          o.name AS organization_name
        FROM lead_assignment_batch_items labi
        JOIN leads l
          ON l.id = labi.lead_id
        JOIN organizations o
          ON o.id = l.organization_id
        WHERE labi.batch_id = $1
        ORDER BY o.name ASC
      `,
      [batch.id],
    );

    return {
      ...batch,
      items:
        itemsResult.rows as LeadAssignmentTaskBatch['items'],
    };
  }

}
