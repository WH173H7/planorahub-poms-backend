import {apiFetch} from '@/lib/api/client';
type R<T>={success:boolean;data:T};
export type ContactMethod={id:string;contact_id:string;type:string;value:string;label:string|null;is_primary:boolean;verification_status:'UNVERIFIED'|'VERIFIED'|'INVALID';notes:string|null;created_at:string};
export type Contact={id:string;organization_id:string;organization_name:string;first_name:string;last_name:string;job_title:string|null;email:string|null;phone:string|null;is_primary:boolean;notes:string|null;created_at:string};
export async function listContacts(){return(await apiFetch<R<Contact[]>>('/admin/contacts')).data}
export async function createContact(input:Record<string,unknown>){return(await apiFetch<R<Contact>>('/admin/contacts',{method:'POST',body:JSON.stringify(input)})).data}
export async function updateContact(id:string,input:Record<string,unknown>){return(await apiFetch<R<Contact>>(`/admin/contacts/${id}`,{method:'PATCH',body:JSON.stringify(input)})).data}
export async function deleteContact(id:string){await apiFetch(`/admin/contacts/${id}`,{method:'DELETE'})}
export async function listMethods(id:string){return(await apiFetch<R<ContactMethod[]>>(`/admin/contacts/${id}/methods`)).data}
export async function createMethod(id:string,input:Record<string,unknown>){return(await apiFetch<R<ContactMethod>>(`/admin/contacts/${id}/methods`,{method:'POST',body:JSON.stringify(input)})).data}
export async function updateMethod(contactId:string,id:string,input:Record<string,unknown>){return(await apiFetch<R<ContactMethod>>(`/admin/contacts/${contactId}/methods/${id}`,{method:'PATCH',body:JSON.stringify(input)})).data}
export async function deleteMethod(contactId:string,id:string){await apiFetch(`/admin/contacts/${contactId}/methods/${id}`,{method:'DELETE'})}
