import { apiFetch } from '@/lib/api/client';
import type { Activity, ApiResponse, AssignmentHistory, Contact, ContactMethod, CreateActivityInput, CreateContactInput, CreateContactMethodInput, CreateOrganizationLeadInput, Lead, LeadStage, LeadTask, MyWork, Pursuit, TaskDetail } from './types';

export async function listLeads(): Promise<Lead[]> {
  return (await apiFetch<ApiResponse<Lead[]>>('/admin/leads')).data;
}

export async function createOrganizationLead(input: CreateOrganizationLeadInput): Promise<Lead> {
  return (await apiFetch<ApiResponse<Lead>>('/admin/leads/organization', {
    method: 'POST',
    body: JSON.stringify(input),
  })).data;
}

export async function getLead(id:string):Promise<Lead>{return(await apiFetch<ApiResponse<Lead>>(`/admin/leads/${id}`)).data;}
export async function listLeadContacts(organizationId:string):Promise<Contact[]>{const contacts=(await apiFetch<ApiResponse<Omit<Contact,'methods'>[]>>(`/admin/contacts/organization/${organizationId}`)).data;return Promise.all(contacts.map(async(contact)=>({...contact,methods:await listContactMethods(contact.id)})));}
export async function createContact(input:CreateContactInput):Promise<Contact>{return(await apiFetch<ApiResponse<Contact>>('/admin/contacts',{method:'POST',body:JSON.stringify(input)})).data;}
export async function updateContact(contactId:string,input:CreateContactInput):Promise<Contact>{return(await apiFetch<ApiResponse<Contact>>(`/admin/contacts/${contactId}`,{method:'PATCH',body:JSON.stringify(input)})).data;}
export async function deleteContact(contactId:string):Promise<void>{await apiFetch(`/admin/contacts/${contactId}`,{method:'DELETE'});}
export async function listContactMethods(contactId:string):Promise<ContactMethod[]>{return(await apiFetch<ApiResponse<ContactMethod[]>>(`/admin/contacts/${contactId}/methods`)).data;}
export async function createContactMethod(contactId:string,input:CreateContactMethodInput):Promise<ContactMethod>{return(await apiFetch<ApiResponse<ContactMethod>>(`/admin/contacts/${contactId}/methods`,{method:'POST',body:JSON.stringify(input)})).data;}
export async function updateContactMethod(contactId:string,methodId:string,input:CreateContactMethodInput):Promise<ContactMethod>{return(await apiFetch<ApiResponse<ContactMethod>>(`/admin/contacts/${contactId}/methods/${methodId}`,{method:'PATCH',body:JSON.stringify(input)})).data;}
export async function deleteContactMethod(contactId:string,methodId:string):Promise<void>{await apiFetch(`/admin/contacts/${contactId}/methods/${methodId}`,{method:'DELETE'});}
export async function getLeadPursuit(leadId:string):Promise<Pursuit|null>{return(await apiFetch<ApiResponse<Pursuit|null>>(`/admin/leads/${leadId}/pursuit`)).data;}
export async function updatePursuitStep(leadId:string,stepId:string,input:{completed:boolean;notes:string|null}):Promise<Pursuit>{return(await apiFetch<ApiResponse<Pursuit>>(`/admin/leads/${leadId}/pursuit/steps/${stepId}`,{method:'PATCH',body:JSON.stringify(input)})).data;}
export async function uploadPursuitEvidence(leadId:string,stepId:string,file:File):Promise<void>{const data=new FormData();data.set('file',file);await apiFetch(`/admin/leads/${leadId}/pursuit/steps/${stepId}/evidence`,{method:'POST',body:data});}
export async function addPursuitComment(
  leadId: string,
  stepId: string,
  body: string,
): Promise<void> {
  await apiFetch(
    `/admin/leads/${leadId}/pursuit/steps/${stepId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}

export async function markPursuitStepReviewed(
  leadId: string,
  stepId: string,
): Promise<Pursuit> {
  return (
    await apiFetch<ApiResponse<Pursuit>>(
      `/admin/leads/${leadId}/pursuit/steps/${stepId}/review`,
      { method: "POST" },
    )
  ).data;
}

export async function requestPursuitRetake(
  leadId: string,
  stepId: string,
  reason: string,
): Promise<Pursuit> {
  return (
    await apiFetch<ApiResponse<Pursuit>>(
      `/admin/leads/${leadId}/pursuit/steps/${stepId}/retake`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    )
  ).data;
}

export async function createAdminRequiredPursuitStep(
  leadId: string,
  input: {
    title: string;
    description?: string | null;
    afterStepId?: string | null;
  },
): Promise<Pursuit> {
  return (
    await apiFetch<ApiResponse<Pursuit>>(
      `/admin/leads/${leadId}/pursuit/custom-steps`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    )
  ).data;
}

export async function listLeadActivities(leadId:string):Promise<Activity[]>{return(await apiFetch<ApiResponse<Activity[]>>(`/admin/leads/${leadId}/activities`)).data;}
export async function listAssignmentHistory(leadId:string):Promise<AssignmentHistory[]>{return(await apiFetch<ApiResponse<AssignmentHistory[]>>(`/admin/leads/${leadId}/assignments`)).data;}
export async function reassignLead(leadId:string,input:{assignedToId:string;reason:string}):Promise<Lead>{return(await apiFetch<ApiResponse<Lead>>(`/admin/leads/${leadId}/reassign`,{method:'POST',body:JSON.stringify(input)})).data;}
export async function changeLeadStage(leadId:string,input:{stage:LeadStage;reason?:string|null},staff=false):Promise<Lead>{return(await apiFetch<ApiResponse<Lead>>(`${staff?'/staff':'/admin'}/leads/${leadId}/stage`,{method:'POST',body:JSON.stringify(input)})).data;}
export async function createLeadActivity(leadId:string,input:CreateActivityInput,staff=false):Promise<Activity>{return(await apiFetch<ApiResponse<Activity>>(`${staff?'/staff':'/admin'}/leads/${leadId}/activities`,{method:'POST',body:JSON.stringify(input)})).data;}

export async function getMyWork():Promise<MyWork>{return(await apiFetch<ApiResponse<MyWork>>('/staff/my-work')).data;}
export async function getOwnedLead(id:string):Promise<Lead>{return(await apiFetch<ApiResponse<Lead>>(`/staff/leads/${id}`)).data;}
export async function listOwnedLeadTasks(id:string):Promise<LeadTask[]>{return(await apiFetch<ApiResponse<LeadTask[]>>(`/staff/leads/${id}/tasks`)).data;}
export async function listOwnedLeadContacts(leadId:string):Promise<Contact[]>{const contacts=(await apiFetch<ApiResponse<Omit<Contact,'methods'>[]>>(`/staff/leads/${leadId}/contacts`)).data;return Promise.all(contacts.map(async(contact)=>({...contact,methods:(await apiFetch<ApiResponse<ContactMethod[]>>(`/staff/leads/${leadId}/contacts/${contact.id}/methods`)).data})));}
export async function getOwnedLeadPursuit(leadId:string):Promise<Pursuit|null>{return(await apiFetch<ApiResponse<Pursuit|null>>(`/staff/leads/${leadId}/pursuit`)).data;}
export async function updateOwnedPursuitStep(leadId:string,stepId:string,input:{completed:boolean;notes:string|null}):Promise<Pursuit>{return(await apiFetch<ApiResponse<Pursuit>>(`/staff/leads/${leadId}/pursuit/steps/${stepId}`,{method:'PATCH',body:JSON.stringify(input)})).data;}
export async function uploadOwnedPursuitEvidence(leadId:string,stepId:string,file:File):Promise<void>{const data=new FormData();data.set('file',file);await apiFetch(`/staff/leads/${leadId}/pursuit/steps/${stepId}/evidence`,{method:'POST',body:data});}
export async function createOwnedPursuitCustomStep(
  leadId: string,
  input: {
    title: string;
    description?: string | null;
    afterStepId?: string | null;
  },
): Promise<Pursuit> {
  return (
    await apiFetch<ApiResponse<Pursuit>>(
      `/staff/leads/${leadId}/pursuit/custom-steps`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    )
  ).data;
}

export async function updateOwnedPursuitCustomStep(
  leadId: string,
  stepId: string,
  input: {
    title: string;
    description?: string | null;
  },
): Promise<Pursuit> {
  return (
    await apiFetch<ApiResponse<Pursuit>>(
      `/staff/leads/${leadId}/pursuit/custom-steps/${stepId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    )
  ).data;
}

export async function deleteOwnedPursuitCustomStep(
  leadId: string,
  stepId: string,
): Promise<Pursuit> {
  return (
    await apiFetch<ApiResponse<Pursuit>>(
      `/staff/leads/${leadId}/pursuit/custom-steps/${stepId}`,
      {
        method: "DELETE",
      },
    )
  ).data;
}

export async function listOwnedLeadActivities(leadId:string):Promise<Activity[]>{return(await apiFetch<ApiResponse<Activity[]>>(`/staff/leads/${leadId}/activities`)).data;}
export async function createOwnedContact(leadId:string,input:CreateContactInput):Promise<Contact>{return(await apiFetch<ApiResponse<Contact>>(`/staff/leads/${leadId}/contacts`,{method:'POST',body:JSON.stringify(input)})).data;}
export async function updateOwnedContact(leadId:string,contactId:string,input:CreateContactInput):Promise<Contact>{return(await apiFetch<ApiResponse<Contact>>(`/staff/leads/${leadId}/contacts/${contactId}`,{method:'PATCH',body:JSON.stringify(input)})).data;}
export async function createOwnedContactMethod(leadId:string,contactId:string,input:CreateContactMethodInput):Promise<ContactMethod>{return(await apiFetch<ApiResponse<ContactMethod>>(`/staff/leads/${leadId}/contacts/${contactId}/methods`,{method:'POST',body:JSON.stringify(input)})).data;}
export async function updateOwnedContactMethod(leadId:string,contactId:string,methodId:string,input:CreateContactMethodInput):Promise<ContactMethod>{return(await apiFetch<ApiResponse<ContactMethod>>(`/staff/leads/${leadId}/contacts/${contactId}/methods/${methodId}`,{method:'PATCH',body:JSON.stringify(input)})).data;}
export async function deleteOwnedContactMethod(leadId:string,contactId:string,methodId:string):Promise<void>{await apiFetch(`/staff/leads/${leadId}/contacts/${contactId}/methods/${methodId}`,{method:'DELETE'});}
export async function listFollowUps(staff:boolean):Promise<Activity[]>{return(await apiFetch<ApiResponse<Activity[]>>(staff?'/staff/follow-ups':'/admin/follow-ups')).data;}
export async function updateActivity(id:string,input:Partial<CreateActivityInput>,staff:boolean):Promise<Activity>{return(await apiFetch<ApiResponse<Activity>>(staff?`/staff/activities/${id}`:`/admin/activities/${id}`,{method:'PATCH',body:JSON.stringify(input)})).data;}
export async function listTasks(staff:boolean):Promise<TaskDetail[]>{return(await apiFetch<ApiResponse<TaskDetail[]>>(staff?'/staff/tasks':'/admin/tasks')).data;}
export async function getTask(id:string,staff:boolean):Promise<TaskDetail>{return(await apiFetch<ApiResponse<TaskDetail>>(`${staff?'/staff':'/admin'}/tasks/${id}`)).data;}
export async function createTask(input:Record<string,unknown>):Promise<TaskDetail>{return(await apiFetch<ApiResponse<TaskDetail>>('/admin/tasks',{method:'POST',body:JSON.stringify(input)})).data;}
export async function updateTask(id:string,input:Record<string,unknown>,staff:boolean):Promise<TaskDetail>{return(await apiFetch<ApiResponse<TaskDetail>>(`${staff?'/staff':'/admin'}/tasks/${id}`,{method:'PATCH',body:JSON.stringify(input)})).data;}
export async function deleteTask(id:string):Promise<void>{await apiFetch(`/admin/tasks/${id}`,{method:'DELETE'});}
export async function uploadTaskAttachment(id:string,file:File,staff=false):Promise<void>{const data=new FormData();data.set('file',file);await apiFetch(`${staff?'/staff':'/admin'}/tasks/${id}/attachments`,{method:'POST',body:data});}
export async function listOrganizations():Promise<Array<{id:string;name:string}>>{return(await apiFetch<ApiResponse<Array<{id:string;name:string}>>>('/admin/organizations')).data;}
export async function listContacts():Promise<Array<{id:string;organization_id:string;organization_name:string;first_name:string;last_name:string;job_title:string|null}>>{return(await apiFetch<ApiResponse<Array<{id:string;organization_id:string;organization_name:string;first_name:string;last_name:string;job_title:string|null}>>>('/admin/contacts')).data;}
export async function createOwnedLeadTask(leadId:string,input:Record<string,unknown>):Promise<TaskDetail>{return(await apiFetch<ApiResponse<TaskDetail>>(`/staff/tasks/lead/${leadId}`,{method:'POST',body:JSON.stringify(input)})).data;}

export async function listAssignmentStaff() {
  return (
    await apiFetch<
      ApiResponse<import('./types').AssignmentStaff[]>
    >('/admin/staff')
  ).data;
}

export async function listPursuitWorkflows() {
  return (
    await apiFetch<
      ApiResponse<import('./types').PursuitWorkflowTemplate[]>
    >('/admin/pursuit-workflows')
  ).data;
}

export async function bulkAssignLeads(
  input: import('./types').BulkAssignmentInput,
) {
  return (
    await apiFetch<
      ApiResponse<import('./types').BulkAssignmentResult>
    >('/admin/leads/bulk-assign', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).data;
}

export type WorkflowEditorStepInput = {
  title: string;
  description?: string | null;
  evidenceRequired: boolean;
};

export type WorkflowEditorInput = {
  name: string;
  description?: string | null;
  steps: WorkflowEditorStepInput[];
};

export async function createPursuitWorkflow(input: WorkflowEditorInput) {
  return (
    await apiFetch<
      ApiResponse<import('./types').PursuitWorkflowTemplate>
    >('/admin/pursuit-workflows', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).data;
}

export async function updatePursuitWorkflow(
  id: string,
  input: WorkflowEditorInput,
) {
  return (
    await apiFetch<
      ApiResponse<import('./types').PursuitWorkflowTemplate>
    >(`/admin/pursuit-workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  ).data;
}

export async function setDefaultPursuitWorkflow(id: string) {
  return (
    await apiFetch<
      ApiResponse<import('./types').PursuitWorkflowTemplate>
    >(`/admin/pursuit-workflows/${id}/default`, {
      method: 'POST',
    })
  ).data;
}

export async function archivePursuitWorkflow(id: string) {
  await apiFetch(`/admin/pursuit-workflows/${id}`, {
    method: 'DELETE',
  });
}

export async function previewLeadImport(rows: import('./types').LeadImportRow[]) {
  return (await apiFetch<ApiResponse<import('./types').LeadImportPreviewRow[]>>('/admin/leads/import/preview', {
    method: 'POST', body: JSON.stringify({ rows }),
  })).data;
}

export async function commitLeadImport(rows: import('./types').LeadImportCommitRow[]) {
  return (await apiFetch<ApiResponse<import('./types').LeadImportResult>>('/admin/leads/import/commit', {
    method: 'POST', body: JSON.stringify({ rows }),
  })).data;
}
export async function listAvailableLeadPool(){return (await apiFetch<ApiResponse<import('./types').Lead[]>>('/staff/lead-pool')).data;}
export async function claimLeadFromPool(id:string){return (await apiFetch<ApiResponse<import('./types').Lead>>(`/staff/lead-pool/${id}/claim`,{method:'POST'})).data;}
export async function assignLeadToTeam(id:string,teamId:string|null){return (await apiFetch<ApiResponse<import('./types').Lead>>(`/admin/leads/${id}/assign-team`,{method:'POST',body:JSON.stringify({teamId})})).data;}
export async function updateLeadRevenue(id:string,body:{proposedRevenue:number;revenueProbability:number;actualRevenue?:number|null}){return (await apiFetch<ApiResponse<import('./types').Lead>>(`/admin/leads/${id}/revenue`,{method:'PATCH',body:JSON.stringify(body)})).data;}
