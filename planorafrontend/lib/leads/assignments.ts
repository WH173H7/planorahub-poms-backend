import { apiFetch } from '@/lib/api/client';

export type AssignmentLead = {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_industry?: string | null;
  organization_website?: string | null;

  title: string;
  stage: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  pursuit_progress: number;

  assigned_to_id?: string | null;
  next_action?: string | null;
  next_follow_up_at?: string | null;

  previous_owner_id?: string | null;
  previous_owner_first_name?: string | null;
  previous_owner_last_name?: string | null;
  current_owner_first_name?: string | null;
  current_owner_last_name?: string | null;

  assigned_at: string;
};

export type AssignmentDetail = {
  id: string;
  title: string;
  instructions: string;

  assigned_to_id: string;
  assigned_by_id?: string | null;

  due_at: string;
  created_at: string;
  updated_at: string;

  task_id?: string | null;
  task_status?: string | null;
  task_completed_at?: string | null;

  workflow_id?: string | null;
  workflow_name?: string | null;

  assignee_first_name?: string | null;
  assignee_last_name?: string | null;
  assignee_email?: string | null;
  assignee_job_title?: string | null;

  creator_first_name?: string | null;
  creator_last_name?: string | null;
  creator_email?: string | null;

  lead_count: number;
  active_lead_count: number;
  completed_pursuit_count: number;
  average_progress: number;

  leads: AssignmentLead[];
};

export type AssignmentAttachment = {
  id: string;
  task_id: string;
  file_name: string;
  mime_type?: string | null;
  file_size?: number | null;
  uploader_first_name?: string | null;
  uploader_last_name?: string | null;
  created_at: string;
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
};

export async function getAssignmentDetail(
  assignmentId: string,
): Promise<AssignmentDetail> {
  const response = await apiFetch<ApiResponse<AssignmentDetail>>(
    `/admin/leads/assignment-batches/${assignmentId}`,
  );

  return response.data;
}

export async function listAssignmentAttachments(assignmentId:string){return(await apiFetch<ApiResponse<AssignmentAttachment[]>>(`/admin/leads/assignment-batches/${assignmentId}/attachments`)).data;}
export async function uploadAssignmentAttachment(assignmentId:string,file:File){const data=new FormData();data.set('file',file);return(await apiFetch<ApiResponse<AssignmentAttachment>>(`/admin/leads/assignment-batches/${assignmentId}/attachments`,{method:'POST',body:data})).data;}
export async function deleteAssignmentAttachment(assignmentId:string,attachmentId:string){await apiFetch(`/admin/leads/assignment-batches/${assignmentId}/attachments/${attachmentId}`,{method:'DELETE'});}
export async function getAssignmentAttachmentDownload(assignmentId:string,attachmentId:string){return(await apiFetch<ApiResponse<{signedUrl:string}>>(`/admin/leads/assignment-batches/${assignmentId}/attachments/${attachmentId}/download`)).data;}
