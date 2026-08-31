import { apiFetch } from '@/lib/api/client';
import type { Activity, ApiResponse, Contact, ContactMethod, CreateContactInput, CreateContactMethodInput, CreateOrganizationLeadInput, Lead, Pursuit } from './types';

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
export async function listLeadActivities(leadId:string):Promise<Activity[]>{return(await apiFetch<ApiResponse<Activity[]>>(`/admin/leads/${leadId}/activities`)).data;}
