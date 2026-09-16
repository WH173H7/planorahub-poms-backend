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

export type TaskAssignmentType = 'UNASSIGNED' | 'STAFF' | 'TEAM' | 'DEPARTMENT';
export type TaskControlState = 'ACTIVE' | 'SCHEDULED' | 'PAUSED' | 'CANCELLED';

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

  taskWorkflowId?: string | null;

  assignmentType?: TaskAssignmentType;
  assignedTeamId?: string | null;
  assignedDepartmentId?: string | null;
  scheduledFor?: string | null;
  controlState?: TaskControlState;

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

  task_workflow_id: string | null;

  task_workflow_name?: string | null;
  assignment_type: TaskAssignmentType;
  assigned_team_id: string | null;
  assigned_team_name?: string | null;
  assigned_department_id: string | null;
  assigned_department_name?: string | null;
  assignee_role_id?: string | null;
  assignee_role_name?: string | null;
  scheduled_for: string | null;
  dispatched_at: string | null;
  control_state: TaskControlState;
  paused_at: string | null;
  cancelled_at: string | null;

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

  private baseSelect(){
    return `
      SELECT
        t.*,
        o.name AS organization_name,
        l.title AS lead_title,
        c.first_name AS contact_first_name,
        c.last_name AS contact_last_name,
        assignee.first_name AS assignee_first_name,
        assignee.last_name AS assignee_last_name,
        assignee.email AS assignee_email,
        assignee_role.id AS assignee_role_id,
        assignee_role.name AS assignee_role_name,
        creator.first_name AS creator_first_name,
        creator.last_name AS creator_last_name,
        tw.name AS task_workflow_name,
        team.name AS assigned_team_name,
        dep.name AS assigned_department_name,
        accepted_by.first_name AS accepted_by_first_name,
        accepted_by.last_name AS accepted_by_last_name
      FROM tasks t
      LEFT JOIN organizations o ON o.id=t.organization_id
      LEFT JOIN leads l ON l.id=t.lead_id
      LEFT JOIN contacts c ON c.id=t.contact_id
      LEFT JOIN users assignee ON assignee.id=t.assigned_to_id
      LEFT JOIN roles assignee_role ON assignee_role.id=assignee.role_id
      LEFT JOIN users creator ON creator.id=t.created_by_id
      LEFT JOIN users accepted_by ON accepted_by.id=t.accepted_by_id
      LEFT JOIN task_workflows tw ON tw.id=t.task_workflow_id
      LEFT JOIN teams team ON team.id=t.assigned_team_id
      LEFT JOIN departments dep ON dep.id=t.assigned_department_id
    `;
  }

  async dispatchDueScheduled(): Promise<TaskRow[]> {
    const result=await this.db.query(`
      UPDATE tasks
      SET control_state='ACTIVE',dispatched_at=COALESCE(dispatched_at,NOW()),updated_at=NOW()
      WHERE control_state='SCHEDULED' AND scheduled_for IS NOT NULL AND scheduled_for<=NOW()
      RETURNING *
    `);
    for(const task of result.rows as TaskRow[]){
      await this.notifyRecipients(task,'New scheduled task',task.title);
      await this.addEvent({
        taskId: task.id,
        eventType: 'STATUS_CHANGED',
        message: 'Scheduled task dispatched automatically',
        oldValues: { controlState: 'SCHEDULED', scheduledFor: task.scheduled_for },
        newValues: { controlState: 'ACTIVE', dispatchedAt: task.dispatched_at },
      });
    }
    return result.rows as TaskRow[];
  }

  async notifyRecipients(task: Pick<TaskRow,'id'|'assigned_to_id'|'assigned_team_id'|'assigned_department_id'>,title:string,body:string) {
    await this.db.query(`
      INSERT INTO notifications(user_id,title,body,kind,href)
      SELECT DISTINCT u.id,$2,$3,'TASK','/tasks/'||$1::text
      FROM users u
      WHERE u.status='ACTIVE' AND (
        u.id=$4::uuid
        OR ($5::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.user_id=u.id AND tm.team_id=$5::uuid))
        OR ($6::uuid IS NOT NULL AND u.department_id=$6::uuid)
      )
    `,[task.id,title,body,task.assigned_to_id,task.assigned_team_id,task.assigned_department_id]);
  }

  async notifyAdmins(title:string,body:string,taskId:string) {
    await this.db.query(`
      INSERT INTO notifications(user_id,title,body,kind,href)
      SELECT u.id,$1,$2,'TASK','/tasks/'||$3::text
      FROM users u
      JOIN roles r ON r.id=u.role_id
      WHERE u.status='ACTIVE' AND r.code='SUPER_ADMIN'
    `,[title,body,taskId]);
  }

  async list(): Promise<TaskRow[]> {
    await this.dispatchDueScheduled();
    const result=await this.db.query(`${this.baseSelect()}
      ORDER BY
        CASE WHEN t.control_state='SCHEDULED' THEN 0 WHEN t.status IN ('COMPLETED','CANCELLED') THEN 2 ELSE 1 END,
        COALESCE(t.scheduled_for,t.due_at) NULLS LAST,
        t.created_at DESC
    `);
    return result.rows as TaskRow[];
  }

  async listOwned(userId: string): Promise<TaskRow[]> {
    await this.dispatchDueScheduled();
    const result=await this.db.query(`${this.baseSelect()}
      WHERE t.control_state<>'SCHEDULED'
        AND (
          t.assigned_to_id=$1::uuid
          OR (t.assigned_team_id IS NOT NULL AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=t.assigned_team_id AND tm.user_id=$1::uuid))
          OR (t.assigned_department_id IS NOT NULL AND EXISTS(SELECT 1 FROM users me WHERE me.id=$1::uuid AND me.department_id=t.assigned_department_id))
        )
      ORDER BY CASE WHEN t.status IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END,t.due_at NULLS LAST,t.created_at DESC
    `,[userId]);
    return result.rows as TaskRow[];
  }

  async findById(id: string): Promise<TaskRow | null> {
    await this.dispatchDueScheduled();
    const result=await this.db.query(`${this.baseSelect()} WHERE t.id=$1 LIMIT 1`,[id]);
    return (result.rows[0] as TaskRow | undefined)??null;
  }

  async findOwnedById(id: string, userId: string): Promise<TaskRow | null> {
    const rows=await this.listOwned(userId);
    return rows.find((task)=>task.id===id)??null;
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

      | 'users'
      | 'teams'
      | 'departments'
      | 'task_workflows',

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

  async ownedLeadContext(leadId: string, userId: string) {
    const result = await this.db.query(
      `SELECT id,organization_id FROM leads WHERE id=$1 AND assigned_to_id=$2 LIMIT 1`,
      [leadId,userId],
    );
    return result.rows[0] ?? null;
  }

  async create(input: TaskInput,createdById?: string): Promise<TaskRow> {
    const assignmentType=input.assignmentType??(input.assignedToId?'STAFF':input.assignedTeamId?'TEAM':input.assignedDepartmentId?'DEPARTMENT':'UNASSIGNED');
    const scheduledFor=input.scheduledFor??null;
    const controlState=input.controlState??(scheduledFor&&new Date(scheduledFor).getTime()>Date.now()?'SCHEDULED':'ACTIVE');
    const result=await this.db.query(`
      INSERT INTO tasks(
        title,description,organization_id,lead_id,contact_id,
        assigned_to_id,assigned_team_id,assigned_department_id,assignment_type,
        created_by_id,status,priority,start_at,due_at,task_workflow_id,
        scheduled_for,dispatched_at,control_state,completed_at
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::task_status,$12::task_priority,$13,$14,$15,$16,
        CASE WHEN $17='ACTIVE' THEN NOW() ELSE NULL END,$17,
        CASE WHEN $11::task_status='COMPLETED'::task_status THEN NOW() ELSE NULL END
      ) RETURNING *
    `,[
      input.title,input.description??null,input.organizationId??null,input.leadId??null,input.contactId??null,
      input.assignedToId??null,input.assignedTeamId??null,input.assignedDepartmentId??null,assignmentType,
      createdById??null,input.status??'TODO',input.priority??'MEDIUM',input.startAt??null,input.dueAt??null,input.taskWorkflowId??null,
      scheduledFor,controlState,
    ]);
    return result.rows[0] as TaskRow;
  }

  async update(id:string,input:TaskInput):Promise<TaskRow|null>{
    const assignmentType=input.assignmentType??(input.assignedToId?'STAFF':input.assignedTeamId?'TEAM':input.assignedDepartmentId?'DEPARTMENT':'UNASSIGNED');
    const result=await this.db.query(`
      UPDATE tasks SET
        title=$2,description=$3,organization_id=$4,lead_id=$5,contact_id=$6,
        assigned_to_id=$7,assigned_team_id=$8,assigned_department_id=$9,assignment_type=$10,
        status=$11::task_status,priority=$12::task_priority,start_at=$13,due_at=$14,task_workflow_id=$15,
        scheduled_for=$16,
        control_state=COALESCE($17,control_state),
        dispatched_at=CASE WHEN COALESCE($17,control_state)='ACTIVE' THEN COALESCE(dispatched_at,NOW()) ELSE dispatched_at END,
        paused_at=CASE WHEN COALESCE($17,control_state)='PAUSED' THEN COALESCE(paused_at,NOW()) ELSE NULL END,
        cancelled_at=CASE WHEN COALESCE($17,control_state)='CANCELLED' THEN COALESCE(cancelled_at,NOW()) ELSE NULL END,
        completed_at=CASE
          WHEN $11::task_status='COMPLETED'::task_status AND completed_at IS NULL THEN NOW()
          WHEN $11::task_status<>'COMPLETED'::task_status THEN NULL
          ELSE completed_at END,
        updated_at=NOW()
      WHERE id=$1 RETURNING *
    `,[id,input.title,input.description??null,input.organizationId??null,input.leadId??null,input.contactId??null,input.assignedToId??null,input.assignedTeamId??null,input.assignedDepartmentId??null,assignmentType,input.status??'TODO',input.priority??'MEDIUM',input.startAt??null,input.dueAt??null,input.taskWorkflowId??null,input.scheduledFor??null,input.controlState??null]);
    return (result.rows[0] as TaskRow|undefined)??null;
  }

  async canUserWorkOnTask(id:string,userId:string){
    const result=await this.db.query(`
      SELECT 1 FROM tasks t
      WHERE t.id=$1::uuid AND t.control_state='ACTIVE'
        AND (
          t.assigned_to_id=$2::uuid
          OR (t.assigned_team_id IS NOT NULL AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=t.assigned_team_id AND tm.user_id=$2::uuid))
          OR (t.assigned_department_id IS NOT NULL AND EXISTS(SELECT 1 FROM users u WHERE u.id=$2::uuid AND u.department_id=t.assigned_department_id))
        )
      LIMIT 1
    `,[id,userId]);
    return result.rowCount===1;
  }

  async accept(id:string,actorUserId:string):Promise<TaskRow|null>{
    const result=await this.db.query(`
      UPDATE tasks t SET
        accepted_at=COALESCE(accepted_at,NOW()),
        accepted_by_id=COALESCE(accepted_by_id,$2::uuid),
        updated_at=NOW()
      WHERE t.id=$1::uuid
        AND t.control_state='ACTIVE'
        AND t.status NOT IN ('COMPLETED','CANCELLED')
        AND (t.accepted_by_id IS NULL OR t.accepted_by_id=$2::uuid)
        AND (
          t.assigned_to_id=$2::uuid
          OR (t.assigned_team_id IS NOT NULL AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=t.assigned_team_id AND tm.user_id=$2::uuid))
          OR (t.assigned_department_id IS NOT NULL AND EXISTS(SELECT 1 FROM users u WHERE u.id=$2::uuid AND u.department_id=t.assigned_department_id))
        )
      RETURNING *
    `,[id,actorUserId]);
    return (result.rows[0] as TaskRow|undefined)??null;
  }

  async start(id:string,actorUserId:string):Promise<TaskRow|null>{
    const result=await this.db.query(`
      UPDATE tasks t SET
        accepted_at=COALESCE(accepted_at,NOW()),accepted_by_id=COALESCE(accepted_by_id,$2::uuid),
        started_at=COALESCE(started_at,NOW()),start_at=COALESCE(start_at,NOW()),status='IN_PROGRESS'::task_status,updated_at=NOW()
      WHERE t.id=$1::uuid AND t.control_state='ACTIVE' AND t.status NOT IN ('COMPLETED','CANCELLED')
        AND (t.accepted_by_id IS NULL OR t.accepted_by_id=$2::uuid)
        AND (
          t.assigned_to_id=$2::uuid
          OR (t.assigned_team_id IS NOT NULL AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=t.assigned_team_id AND tm.user_id=$2::uuid))
          OR (t.assigned_department_id IS NOT NULL AND EXISTS(SELECT 1 FROM users u WHERE u.id=$2::uuid AND u.department_id=t.assigned_department_id))
        )
      RETURNING *
    `,[id,actorUserId]);
    return (result.rows[0] as TaskRow|undefined)??null;
  }

  async control(id:string,action:'PAUSE'|'RESUME'|'CANCEL'|'COMPLETE'|'REOPEN'|'DISPATCH_NOW'){
    const map:any={PAUSE:{state:'PAUSED'},RESUME:{state:'ACTIVE'},CANCEL:{state:'CANCELLED',status:'CANCELLED'},COMPLETE:{state:'ACTIVE',status:'COMPLETED'},REOPEN:{state:'ACTIVE',status:'TODO'},DISPATCH_NOW:{state:'ACTIVE'}};
    const next=map[action];
    const result=await this.db.query(`
      UPDATE tasks SET
        control_state=$2,
        status=COALESCE($3::task_status,status),
        dispatched_at=CASE WHEN $2='ACTIVE' THEN COALESCE(dispatched_at,NOW()) ELSE dispatched_at END,
        paused_at=CASE WHEN $2='PAUSED' THEN NOW() ELSE NULL END,
        cancelled_at=CASE WHEN $2='CANCELLED' THEN NOW() ELSE NULL END,
        completed_at=CASE WHEN $3::task_status='COMPLETED' THEN NOW() WHEN $3::task_status='TODO' THEN NULL ELSE completed_at END,
        scheduled_for=CASE WHEN $4='DISPATCH_NOW' THEN NULL ELSE scheduled_for END,
        updated_at=NOW()
      WHERE id=$1 RETURNING *
    `,[id,next.state,next.status??null,action]);
    return (result.rows[0] as TaskRow|undefined)??null;
  }

  async assignmentMeta(userId:string){
    return (await this.db.query(`SELECT u.id,u.role_id,u.department_id,r.name role_name,d.name department_name FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id WHERE u.id=$1 LIMIT 1`,[userId])).rows[0]??null;
  }

  async workflowMeta(id:string){
    return (await this.db.query(`SELECT id,scope_type,role_id,team_id,department_id,is_active FROM task_workflows WHERE id=$1 LIMIT 1`,[id])).rows[0]??null;
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

  async workflowForTask(taskId: string) {
    const workflow = await this.db.query(`
      SELECT w.id,w.name,w.description,w.category
      FROM tasks t JOIN task_workflows w ON w.id=t.task_workflow_id
      WHERE t.id=$1 LIMIT 1
    `,[taskId]);
    if (!workflow.rows[0]) return null;
    const steps = await this.db.query(`
      SELECT s.id,s.position,s.title,s.guidance,s.requires_evidence,
             p.completed_at,p.completed_by_id,u.first_name AS completed_by_first_name,u.last_name AS completed_by_last_name
      FROM task_workflow_steps s
      LEFT JOIN task_workflow_progress p ON p.step_id=s.id AND p.task_id=$1
      LEFT JOIN users u ON u.id=p.completed_by_id
      WHERE s.workflow_id=$2 ORDER BY s.position
    `,[taskId,workflow.rows[0].id]);
    return {...workflow.rows[0],steps:steps.rows};
  }

  async toggleWorkflowStep(taskId:string,stepId:string,userId:string,completed:boolean){
    const valid=await this.db.query(`SELECT 1 FROM tasks t JOIN task_workflow_steps s ON s.workflow_id=t.task_workflow_id WHERE t.id=$1 AND s.id=$2 LIMIT 1`,[taskId,stepId]);
    if(!valid.rowCount) return false;
    await this.db.query(`INSERT INTO task_workflow_progress(task_id,step_id,completed_by_id,completed_at,updated_at) VALUES($1,$2,$3,CASE WHEN $4 THEN NOW() ELSE NULL END,NOW()) ON CONFLICT(task_id,step_id) DO UPDATE SET completed_by_id=CASE WHEN $4 THEN $3 ELSE NULL END,completed_at=CASE WHEN $4 THEN NOW() ELSE NULL END,updated_at=NOW()`,[taskId,stepId,userId,completed]);
    return true;
  }

}
