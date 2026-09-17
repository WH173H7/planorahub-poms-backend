export const LEAD_STAGES = [
  'NEW', 'ASSIGNED', 'RESEARCHING', 'CONTACT_FOUND', 'CONTACTED',
  'AWAITING_REPLY', 'FOLLOW_UP', 'ENGAGED', 'READY_FOR_PROSPECT_REVIEW',
  'QUALIFIED', 'NURTURE', 'UNQUALIFIED', 'DISQUALIFIED',
] as const;

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export type Lead = {
  id: string;
  record_type: 'LEAD' | 'PROSPECT' | 'CLIENT';
  organization_id: string;
  organization_name: string;
  organization_type: string;
  organization_website: string | null;
  organization_email: string | null;
  organization_phone: string | null;
  organization_city: string | null;
  organization_state: string | null;
  organization_country: string | null;
  industry: string | null;
  title: string;
  source: string | null;
  stage: LeadStage;
  priority: LeadPriority;
  assigned_to_id: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  pursuit_progress: number;
  current_assignment_batch_id: string | null;
  current_assignment_title: string | null;
  current_assignment_task_id: string | null;
  current_assignment_due_at: string | null;
  next_action: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  proposed_revenue?: number;
  revenue_probability?: number;
  weighted_revenue?: number;
  actual_revenue?: number | null;
  expected_revenue: number | null;
  available_in_pool: boolean;
  pool_published_at: string | null;
  pool_published_by_id: string | null;
  pool_published_by_first_name: string | null;
  pool_published_by_last_name: string | null;
  claimed_at: string | null;
  claimed_by_id: string | null;
  claimed_by_first_name: string | null;
  claimed_by_last_name: string | null;
  assigned_team_id: string | null;
  assigned_team_name: string | null;
  team_lead_first_name: string | null;
  team_lead_last_name: string | null;
  updated_at: string;
};

export type CreateOrganizationLeadInput = {
  organizationName: string;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  priority: LeadPriority;
  notes?: string | null;
};

export type ApiResponse<T> = { success: true; data: T };

export const CONTACT_METHOD_TYPES = ['EMAIL','PHONE','LINKEDIN','X','INSTAGRAM','FACEBOOK','WEBSITE','OTHER'] as const;
export type ContactMethodType = (typeof CONTACT_METHOD_TYPES)[number];
export type ContactMethodVerificationStatus = 'UNVERIFIED'|'VERIFIED'|'INVALID';
export type ContactMethod = { id:string; contact_id:string; type:ContactMethodType; value:string; label:string|null; is_primary:boolean; verification_status:ContactMethodVerificationStatus; notes:string|null; legacy_source:'CONTACT_EMAIL'|'CONTACT_PHONE'|null; created_at:string; updated_at:string };
export type Contact = { id:string; organization_id:string; first_name:string; last_name:string; job_title:string|null; email:string|null; phone:string|null; is_primary:boolean; notes:string|null; created_at:string; updated_at:string; methods:ContactMethod[] };
export type CreateContactInput = { organizationId:string; firstName:string; lastName:string; jobTitle?:string|null; email?:string|null; phone?:string|null; isPrimary?:boolean; notes?:string|null };
export type CreateContactMethodInput = { type:ContactMethodType; value:string; label?:string|null; notes?:string|null;verificationStatus?:ContactMethodVerificationStatus;isPrimary?:boolean };
export type PursuitEvidence = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

export type PursuitStepOrigin =
  | "WORKFLOW"
  | "STAFF_CUSTOM"
  | "ADMIN_REQUIRED";

export type PursuitReviewStatus =
  | "PENDING"
  | "SUBMITTED"
  | "APPROVED"
  | "RETAKE_REQUIRED";

export type PursuitComment = {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_id: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
};

export type PursuitSubmissionEvidence = {
  id: string;
  evidence_id: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

export type PursuitSubmission = {
  id: string;
  submission_number: number;
  notes: string | null;
  submitted_at: string;
  submitted_by_id: string | null;
  submitted_by_first_name: string | null;
  submitted_by_last_name: string | null;
  evidence: PursuitSubmissionEvidence[];
};

export type PursuitStep = {
  id: string;
  title: string;
  description: string | null;
  position: number;

  evidence_required: boolean;

  completed: boolean;
  completed_at: string | null;
  completed_by_first_name: string | null;
  completed_by_last_name: string | null;

  notes: string | null;

  step_origin: PursuitStepOrigin;
  review_status: PursuitReviewStatus;

  added_by_id: string | null;
  added_by_first_name: string | null;
  added_by_last_name: string | null;

  retake_reason: string | null;
  retake_requested_at: string | null;
  retake_requested_by_id: string | null;
  retake_requested_by_first_name: string | null;
  retake_requested_by_last_name: string | null;

  evidence: PursuitEvidence[];
  comments: PursuitComment[];
  submissions: PursuitSubmission[];
};

export type Pursuit = {
  id: string;
  lead_id: string;
  created_at: string;
  steps: PursuitStep[];
};
export type Activity = { id:string; title:string; activity_type:'CALL'|'MEETING'|'EMAIL'|'FOLLOW_UP'|'NOTE'|'OTHER'; status:'PLANNED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'; description:string|null; outcome:string|null;organization_name:string|null;lead_id:string|null;lead_title:string|null; contact_first_name:string|null; contact_last_name:string|null; assignee_first_name:string|null; assignee_last_name:string|null;creator_first_name:string|null;creator_last_name:string|null; scheduled_at:string|null; completed_at:string|null; next_follow_up_at:string|null; created_at:string };
export type CreateActivityInput = { title:string; activityType:Activity['activity_type']; status:Activity['status']; description?:string|null; contactId?:string|null; scheduledAt?:string|null; nextFollowUpAt?:string|null };
export type AssignmentHistory = { id:string; previous_owner_id:string|null; assigned_to_id:string|null; reason:string|null; assigned_at:string; previous_owner_first_name:string|null; previous_owner_last_name:string|null; assigned_to_first_name:string|null; assigned_to_last_name:string|null; assigned_by_first_name:string|null; assigned_by_last_name:string|null };
export type MyWork = { metrics:{assigned_leads:number;active_pursuits:number;tasks_due_today:number;overdue_tasks:number;follow_ups_today:number;overdue_follow_ups:number};leads:Lead[] };
export type LeadTask = {id:string;title:string;status:string;priority:string;due_at:string|null;completed_at:string|null};
export type TaskDetail = LeadTask & {accepted_at:string|null;accepted_by_id:string|null;accepted_by_first_name?:string|null;accepted_by_last_name?:string|null;started_at:string|null;description:string|null;organization_id:string|null;organization_name:string|null;lead_id:string|null;lead_title:string|null;contact_id:string|null;contact_first_name:string|null;contact_last_name:string|null;assigned_to_id:string|null;assignee_first_name:string|null;assignee_last_name:string|null;assignee_role_id?:string|null;assignee_role_name?:string|null;assignment_type:'UNASSIGNED'|'STAFF'|'TEAM'|'DEPARTMENT';assigned_team_id:string|null;assigned_team_name?:string|null;assigned_department_id:string|null;assigned_department_name?:string|null;scheduled_for:string|null;dispatched_at:string|null;control_state:'ACTIVE'|'SCHEDULED'|'PAUSED'|'CANCELLED';paused_at:string|null;cancelled_at:string|null;creator_first_name:string|null;creator_last_name:string|null;created_at:string;task_workflow_id:string|null;task_workflow_name?:string|null;task_workflow?:null|{id:string;name:string;description:string|null;category:string|null;steps:Array<{id:string;position:number;title:string;guidance:string|null;requires_evidence:boolean;completed_at:string|null;completed_by_id:string|null;completed_by_first_name:string|null;completed_by_last_name:string|null}>};events:Array<{id:string;event_type:string;message:string|null;created_at:string;actor_first_name:string|null;actor_last_name:string|null}>;attachments:Array<{id:string;file_name:string;file_size:number|null;created_at:string}>;lead_assignment_batch:null|{id:string;title:string;instructions:string;assigned_to_id:string;assigned_by_id:string|null;priority:string;due_at:string;task_id:string|null;created_at:string;items:Array<{id:string;lead_id:string;organization_id:string;organization_name:string;stage:string;pursuit_progress:number;priority:string;previous_owner_id:string|null}>}};

export type AssignmentStaff = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  role_id: string;
  role_code: string;
  role_name: string;
  department_id: string | null;
  department_name: string | null;
};

export type PursuitWorkflowStepTemplate = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  evidence_required: boolean;
};

export type PursuitWorkflowTemplate = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  steps: PursuitWorkflowStepTemplate[];
};

export type BulkAssignmentInput = {
  leadIds: string[];
  assignedToId: string;
  title: string;
  instructions: string;
  dueAt: string;
  priority: LeadPriority;
  workflowId: string;
};

export type BulkAssignmentResult = {
  batchId: string;
  taskId: string;
  title: string;
  assignedToId: string;
  leadCount: number;
  dueAt: string;
};

export type LeadImportRow = {
  rowNumber: number;
  organizationName: string;
  industry?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  source?: string | null;
  priority?: LeadPriority;
  notes?: string | null;
};
export type LeadImportPreviewRow = LeadImportRow & {
  status: 'READY' | 'EXISTING_ORGANIZATION' | 'EXISTING_LEAD' | 'DUPLICATE_FILE';
  message: string;
  defaultAction: 'CREATE_NEW' | 'USE_EXISTING' | 'SKIP';
  existingOrganization: null | { id:string; name:string; website:string|null; email:string|null; organization_type:string; has_lead:boolean };
};
export type LeadImportCommitRow = LeadImportRow & {
  action: 'CREATE_NEW' | 'USE_EXISTING' | 'SKIP';
  existingOrganizationId?: string | null;
};
export type LeadImportResult = {
  created: Array<{ rowNumber:number; leadId:string; organizationId:string; organizationName:string; reusedOrganization:boolean }>;
  skipped: Array<{ rowNumber:number; organizationName:string; reason:string }>;
  totalCreated: number;
  totalSkipped: number;
};
