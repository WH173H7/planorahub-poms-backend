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
  current_assignment_title: string | null;
  current_assignment_task_id: string | null;
  current_assignment_due_at: string | null;
  next_action: string | null;
  next_follow_up_at: string | null;
  created_at: string;
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
export type CreateContactMethodInput = { type:ContactMethodType; value:string; label?:string|null; notes?:string|null };
export type PursuitEvidence = { id:string; file_name:string; mime_type:string; file_size:number; created_at:string };
export type PursuitStep = { id:string; title:string; description:string|null; position:number; evidence_required:boolean; completed:boolean; completed_at:string|null; completed_by_first_name:string|null; completed_by_last_name:string|null; notes:string|null; evidence:PursuitEvidence[] };
export type Pursuit = { id:string; lead_id:string; created_at:string; steps:PursuitStep[] };
export type Activity = { id:string; title:string; activity_type:'CALL'|'MEETING'|'EMAIL'|'FOLLOW_UP'|'NOTE'|'OTHER'; status:'PLANNED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'; description:string|null; outcome:string|null; contact_first_name:string|null; contact_last_name:string|null; assignee_first_name:string|null; assignee_last_name:string|null; scheduled_at:string|null; completed_at:string|null; next_follow_up_at:string|null; created_at:string };
