import {apiFetch} from '@/lib/api/client';
import {supabase} from '@/lib/supabase/client';
type R<T>={success:true;data:T};
export type TaskWorkflow={id:string;name:string;description:string|null;category:string|null;is_active:boolean;steps:Array<{id:string;position:number;title:string;guidance:string|null;requires_evidence:boolean}>};
export async function listTaskWorkflows(admin=false){return(await apiFetch<R<TaskWorkflow[]>>(admin?'/task-workflows/admin/all':'/task-workflows')).data}
export async function createTaskWorkflow(input:Record<string,unknown>){return(await apiFetch<R<TaskWorkflow>>('/task-workflows',{method:'POST',body:JSON.stringify(input)})).data}
export async function updateTaskWorkflow(id:string,input:Record<string,unknown>){return(await apiFetch<R<TaskWorkflow>>(`/task-workflows/${id}`,{method:'PATCH',body:JSON.stringify(input)})).data}
export async function archiveTaskWorkflow(id:string){await apiFetch(`/task-workflows/${id}`,{method:'DELETE'})}
export async function toggleTaskWorkflowStep(taskId:string,stepId:string,completed:boolean,staff:boolean){return(await apiFetch<R<unknown>>(`${staff?'/staff':'/admin'}/tasks/${taskId}/workflow-steps/${stepId}`,{method:'POST',body:JSON.stringify({completed})})).data}

export type CommunicationTemplate={id:string;name:string;category:string|null;subject:string|null;body:string;usage_notes:string|null;is_active:boolean;updated_at:string};
export async function listTemplates(admin=false){return(await apiFetch<R<CommunicationTemplate[]>>(admin?'/communications/templates/admin/all':'/communications/templates')).data}
export async function createTemplate(input:Record<string,unknown>){return(await apiFetch<R<CommunicationTemplate>>('/communications/templates',{method:'POST',body:JSON.stringify(input)})).data}
export async function updateTemplate(id:string,input:Record<string,unknown>){return(await apiFetch<R<CommunicationTemplate>>(`/communications/templates/${id}`,{method:'PATCH',body:JSON.stringify(input)})).data}
export async function archiveTemplate(id:string){await apiFetch(`/communications/templates/${id}`,{method:'DELETE'})}

export type ChatChannel={id:string;name:string;description:string|null;visibility:string;message_count:number};
export type ChatMessage={id:string;channel_id:string;sender_user_id:string|null;body:string;created_at:string;first_name:string|null;last_name:string|null;job_title:string|null};
export async function listChatChannels(){return(await apiFetch<R<ChatChannel[]>>('/internal-chat/channels')).data}
export async function createChatChannel(input:Record<string,unknown>){return(await apiFetch<R<ChatChannel>>('/internal-chat/channels',{method:'POST',body:JSON.stringify(input)})).data}
export async function listChatMessages(id:string){return(await apiFetch<R<ChatMessage[]>>(`/internal-chat/channels/${id}/messages`)).data}
export async function sendChatMessage(id:string,body:string){return(await apiFetch<R<ChatMessage>>(`/internal-chat/channels/${id}/messages`,{method:'POST',body:JSON.stringify({body})})).data}

export type GmailStatus={configured:boolean;connected:boolean;account:null|{google_email:string;connected_at:string}};
export type GmailMessage={id:string;threadId:string;snippet:string;from:string;to:string;subject:string;date:string;body?:string;labelIds?:string[]};
export async function gmailStatus(){return(await apiFetch<R<GmailStatus>>('/gmail/status')).data}
export async function gmailConnectUrl(){return(await apiFetch<R<{url:string}>>('/gmail/connect')).data.url}
export async function gmailDisconnect(){await apiFetch('/gmail/connection',{method:'DELETE'})}
export async function gmailMessages(q=''){return(await apiFetch<R<GmailMessage[]>>(`/gmail/messages${q?`?q=${encodeURIComponent(q)}`:''}`)).data}
export async function gmailMessage(id:string){return(await apiFetch<R<GmailMessage>>(`/gmail/messages/${encodeURIComponent(id)}`)).data}
export async function gmailSend(input:{to:string;cc?:string;subject:string;body:string}){return(await apiFetch<R<unknown>>('/gmail/send',{method:'POST',body:JSON.stringify(input)})).data}

export type CompanyReportFilters={from?:string;to?:string;staffId?:string;departmentId?:string;organizationId?:string;recordType?:string;leadStage?:string;taskStatus?:string;focus?:string};
export type CompanyReport={range:{from:string|null;to:string|null};filters:CompanyReportFilters;lifecycle:Array<{record_type:string;count:number}>;leadStages:Array<{stage:string;count:number}>;tasks:Array<{status:string;count:number}>;staff:Array<{id:string;first_name:string;last_name:string;job_title:string|null;department_name:string|null;assigned_tasks:number;completed_tasks:number;overdue_tasks:number;active_leads:number}>;followUps:{due_today:number;overdue:number;completed:number};conversion:{leads:number;prospects:number;clients:number};organizations:Array<{id:string;name:string;industry:string|null;status:string;crm_records:number;contacts:number;tasks:number;overdue_tasks:number}>;options:{staff:Array<{id:string;first_name:string;last_name:string;job_title:string|null}>;departments:Array<{id:string;name:string}>;organizations:Array<{id:string;name:string}>;leadStages:string[];taskStatuses:string[]}};
export async function getCompanyReport(filters:CompanyReportFilters={}){const p=new URLSearchParams();Object.entries(filters).forEach(([k,v])=>{if(v)p.set(k,String(v))});return(await apiFetch<R<CompanyReport>>(`/admin/reports${p.toString()?`?${p}`:''}`)).data}

export type LetterSettings={organization_name:string;tagline:string|null;address:string|null;email:string|null;phone:string|null;website:string|null;footer_text:string|null;signatory_name:string|null;signatory_title:string|null};
export type LetterDocument={id:string;title:string;reference_number:string|null;letter_date:string;recipient_name:string|null;recipient_organization:string|null;recipient_address:string|null;subject:string|null;body:string;closing:string;signatory_name:string|null;signatory_title:string|null;signature_data_url:string|null;signature_scale:number|null;signature_offset_x:number|null;signature_offset_y:number|null;approval_status?:string;approval_note?:string|null;submitted_for_approval_at?:string|null;approved_at?:string|null;created_by_id?:string|null;updated_at:string};
export async function getLetterSettings(){return(await apiFetch<R<LetterSettings>>('/letterhead/settings')).data}
export async function updateLetterSettings(input:Record<string,unknown>){return(await apiFetch<R<LetterSettings>>('/letterhead/settings',{method:'PATCH',body:JSON.stringify(input)})).data}
export async function listLetters(){return(await apiFetch<R<LetterDocument[]>>('/letterhead/letters')).data}
export async function createLetter(input:Record<string,unknown>){return(await apiFetch<R<LetterDocument>>('/letterhead/letters',{method:'POST',body:JSON.stringify(input)})).data}
export async function updateLetter(id:string,input:Record<string,unknown>){return(await apiFetch<R<LetterDocument>>(`/letterhead/letters/${id}`,{method:'PATCH',body:JSON.stringify(input)})).data}
export async function downloadLetterPdf(id:string,title:string){const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error('No authenticated session');const base=process.env.NEXT_PUBLIC_API_URL??'http://127.0.0.1:4000/api';const res=await fetch(`${base}/letterhead/letters/${id}/pdf`,{headers:{Authorization:`Bearer ${session.access_token}`}});if(!res.ok)throw new Error('Unable to generate PDF');const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${title.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'PlanoraHub-letter'}.pdf`;a.click();URL.revokeObjectURL(url)}
export async function submitLetterForApproval(id:string){return(await apiFetch<R<LetterDocument>>(`/letterhead/letters/${id}/submit`,{method:'POST'})).data}
export async function reviewLetter(id:string,status:'APPROVED'|'CHANGES_REQUESTED',note?:string){return(await apiFetch<R<LetterDocument>>(`/letterhead/letters/${id}/review`,{method:'POST',body:JSON.stringify({status,note})})).data}
export async function listLetterApprovalExemptions(){return(await apiFetch<R<Array<{id:string;subject_type:'STAFF'|'TEAM';subject_id:string}>>>('/letterhead/approval-exemptions')).data}
export async function setLetterApprovalExemption(subjectType:'STAFF'|'TEAM',subjectId:string,enabled:boolean){return(await apiFetch<R<boolean>>('/letterhead/approval-exemptions',{method:'POST',body:JSON.stringify({subjectType,subjectId,enabled})})).data}
