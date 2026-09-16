'use client';

import Link from 'next/link';
import {type ChangeEvent,useCallback,useEffect,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Badge,type Tone} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Modal} from '@/components/ui/modal';
import {PageErrorState,PageLoadingState} from '@/components/ui/page-state';
import {getCurrentCrmUser} from '@/lib/auth/current-user';
import {hasAdministrativeAccess} from '@/lib/auth/routing';
import {controlTask,getTask,updateTask,uploadTaskAttachment} from '@/lib/leads/api';
import {formatDate} from '@/lib/leads/helpers';
import {reviewTask,taskAccept,taskStart,taskSubmit} from '@/lib/delivery/api';
import {toggleTaskWorkflowStep} from '@/lib/workspace/api';
import type {TaskDetail} from '@/lib/leads/types';

const pretty=(v:string)=>v==='AWAITING_RESPONSE'?'Submitted for review':v==='BLOCKED'?'Needs revision':v.replaceAll('_',' ').toLowerCase().replace(/^./,x=>x.toUpperCase());
const statusTone=(s:string):Tone=>s==='COMPLETED'?'success':s==='BLOCKED'||s==='CANCELLED'?'danger':s==='IN_PROGRESS'?'info':s==='AWAITING_RESPONSE'?'warning':'neutral';
const priorityTone=(p:string):Tone=>p==='URGENT'?'danger':p==='HIGH'?'warning':p==='MEDIUM'?'purple':'neutral';
const controlTone=(s:string):Tone=>s==='PAUSED'?'warning':s==='CANCELLED'?'danger':s==='SCHEDULED'?'info':'success';
const person=(f?:string|null,l?:string|null)=>[f,l].filter(Boolean).join(' ')||'—';
const fileSize=(bytes:number|null)=>bytes==null?'':bytes<1024?`${bytes} B`:bytes<1024*1024?`${Math.round(bytes/1024)} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;

export function TaskDetailView({taskId}:{taskId:string}){
  const [staffMode,setStaffMode]=useState<boolean|null>(null);
  const [currentUserId,setCurrentUserId]=useState<string|null>(null);
  const [task,setTask]=useState<TaskDetail|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [reviewNote,setReviewNote]=useState('');
  const load=useCallback(async()=>{try{const user=await getCurrentCrmUser();const isStaff=!hasAdministrativeAccess(user);setStaffMode(isStaff);setCurrentUserId(user.id);setTask(await getTask(taskId,isStaff));setError(null)}catch(e){setError(e instanceof Error?e.message:'Unable to load task')}},[taskId]);
  useEffect(()=>{void load()},[load]);
  if(staffMode===null)return <main><PageLoadingState/></main>;
  if(error||!task)return <AppShell area={staffMode?'staff':'admin'} title="Task" breadcrumb="Work / Tasks"><PageErrorState message={error||'Task not found'}/></AppShell>;

  async function staffAction(action:'accept'|'start'|'submit'){
    setBusy(true);try{if(action==='accept')await taskAccept(taskId);if(action==='start')await taskStart(taskId);if(action==='submit')await taskSubmit(taskId);await load()}finally{setBusy(false)}
  }
  async function review(decision:'APPROVE'|'REVISION'){
    setBusy(true);try{await reviewTask(taskId,decision,reviewNote.trim()||undefined);setReviewNote('');await load()}finally{setBusy(false)}
  }
  async function control(action:'PAUSE'|'RESUME'|'CANCEL'|'COMPLETE'|'REOPEN'|'DISPATCH_NOW'){
    if((action==='CANCEL'||action==='COMPLETE')&&!window.confirm(action==='CANCEL'?'Cancel this task?':'Mark this task completed?'))return;
    setBusy(true);try{await controlTask(taskId,action);await load()}finally{setBusy(false)}
  }
  async function upload(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;setUploading(true);try{await uploadTaskAttachment(taskId,file,staffMode ?? undefined);await load()}finally{setUploading(false);e.target.value=''}}

  const target=assignmentName(task);
  const worker=task.accepted_by_id?person(task.accepted_by_first_name,task.accepted_by_last_name):null;
  const staffLocked=staffMode&&task.accepted_by_id&&task.accepted_by_id!==undefined&&task.accepted_by_id!==null&&!task.accepted_at?false:false;

  return <AppShell area={staffMode?'staff':'admin'} title={task.title} breadcrumb="Work / Tasks" actions={!staffMode?<Button variant="outline" onClick={()=>setEditing(true)}>Edit task</Button>:undefined}>
    <div className="p26-task-detail-page">
      <Card className="workspace-card p26-task-hero">
        <div className="p26-task-hero-main"><div className="p26-task-hero-badges"><Badge tone={controlTone(task.control_state)}>{pretty(task.control_state)}</Badge><Badge tone={statusTone(task.status)}>{pretty(task.status)}</Badge><Badge tone={priorityTone(task.priority)}>{pretty(task.priority)} priority</Badge></div><h1>{task.title}</h1><p>{task.description||'No additional instructions were provided.'}</p></div>
        <div className="p26-task-hero-grid"><div><span>Assigned to</span><strong>{target}</strong><small>{pretty(task.assignment_type)}</small></div><div><span>Workflow</span><strong>{task.task_workflow_name||'No workflow'}</strong><small>{task.assignee_role_name||'Task process'}</small></div><div><span>Due</span><strong>{task.due_at?formatDate(task.due_at):'No deadline'}</strong><small>{task.control_state==='SCHEDULED'&&task.scheduled_for?`Dispatches ${formatDate(task.scheduled_for)}`:'Operational deadline'}</small></div><div><span>Accepted by</span><strong>{worker||'Not accepted'}</strong><small>{task.accepted_at?formatDate(task.accepted_at):'Waiting'}</small></div></div>
      </Card>

      {!staffMode?<AdminControls task={task} busy={busy} control={control} review={review} reviewNote={reviewNote} setReviewNote={setReviewNote}/>:<StaffControls task={task} currentUserId={currentUserId} busy={busy} action={staffAction}/>} 

      <div className="p26-task-detail-layout">
        <main className="p26-task-detail-main">
          {task.task_workflow?<Card className="workspace-card p26-task-section"><header><div><span className="eyebrow">Process guide</span><h2>{task.task_workflow.name}</h2><p>{task.task_workflow.description||'Complete the workflow steps while the task is in progress.'}</p></div><Badge tone="purple">{task.task_workflow.steps.filter(s=>s.completed_at).length}/{task.task_workflow.steps.length}</Badge></header><div className="p26-task-checklist">{task.task_workflow.steps.map(step=><button type="button" key={step.id} className={step.completed_at?'is-complete':''} disabled={busy||task.control_state!=='ACTIVE'||Boolean(staffMode&&task.accepted_by_id&&currentUserId&&task.accepted_by_id!==currentUserId)} onClick={async()=>{setBusy(true);try{await toggleTaskWorkflowStep(taskId,step.id,!step.completed_at,staffMode);await load()}finally{setBusy(false)}}}><span>{step.completed_at?'✓':String(step.position).padStart(2,'0')}</span><div><strong>{step.title}</strong>{step.guidance?<small>{step.guidance}</small>:null}{step.requires_evidence?<em>Evidence expected</em>:null}</div></button>)}</div></Card>:null}

          <Card className="workspace-card p26-task-section"><header><div><span className="eyebrow">CRM context</span><h2>Related work</h2></div></header>{task.lead_id||task.organization_name||task.contact_id?<div className="p26-task-context-grid">{task.organization_name?<div><span>Organization</span><strong>{task.organization_name}</strong></div>:null}{task.lead_id?<div><span>Lead</span><Link href={staffMode?`/my-work/leads/${task.lead_id}`:`/leads/${task.lead_id}`}>{task.lead_title||'Open Lead'} →</Link></div>:null}{task.contact_id?<div><span>Contact</span><strong>{person(task.contact_first_name,task.contact_last_name)}</strong></div>:null}</div>:<div className="task-empty-context"><strong>General company task</strong><p>This work is not tied to a CRM record.</p></div>}</Card>

          <Card className="workspace-card p26-task-section"><header><div><span className="eyebrow">Supporting files</span><h2>Attachments</h2><p>Keep briefs, evidence and delivery files with the task.</p></div><label className="ui-button ui-button--outline ui-button--sm">{uploading?'Uploading…':'+ Add file'}<input type="file" hidden disabled={uploading} onChange={upload}/></label></header>{task.attachments.length?<div className="p26-task-file-grid">{task.attachments.map(file=><article key={file.id}><span>▤</span><div><strong>{file.file_name}</strong><small>{[fileSize(file.file_size),formatDate(file.created_at)].filter(Boolean).join(' · ')}</small></div></article>)}</div>:<div className="task-empty-context"><strong>No attachments yet</strong><p>Upload supporting documents when needed.</p></div>}</Card>
        </main>

        <aside className="p26-task-detail-side"><Card className="workspace-card p26-task-section p26-task-timeline"><header><div><span className="eyebrow">History</span><h2>Task timeline</h2></div></header>{task.events.length?<ol>{task.events.map(event=><li key={event.id}><span/><div><strong>{pretty(event.event_type)}</strong><p>{event.message||'Task activity recorded.'}</p><small>{person(event.actor_first_name,event.actor_last_name)} · {formatDate(event.created_at)}</small></div></li>)}</ol>:<p className="ui-help">No task activity yet.</p>}</Card></aside>
      </div>
      {!staffMode?<EditTaskModal open={editing} task={task} onClose={()=>setEditing(false)} onSaved={async()=>{setEditing(false);await load()}}/>:null}
    </div>
  </AppShell>;
}

function AdminControls({task,busy,control,review,reviewNote,setReviewNote}:{task:TaskDetail;busy:boolean;control:(a:'PAUSE'|'RESUME'|'CANCEL'|'COMPLETE'|'REOPEN'|'DISPATCH_NOW')=>Promise<void>;review:(d:'APPROVE'|'REVISION')=>Promise<void>;reviewNote:string;setReviewNote:(value:string)=>void}){
  return <Card className="workspace-card p26-task-control-center"><div><span className="eyebrow">Admin controls</span><h2>Task lifecycle</h2><p>Pause work without losing history, dispatch scheduled work immediately, or close/reopen it when operations change.</p>{task.status==='AWAITING_RESPONSE'?<label className="p26-task-review-note"><span>Review note</span><textarea rows={3} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Optional feedback for approval, or explain what should be revised…"/></label>:null}</div><div className="p26-task-control-actions">{task.status==='AWAITING_RESPONSE'?<><Button variant="outline" loading={busy} onClick={()=>void review('REVISION')}>Request revision</Button><Button loading={busy} onClick={()=>void review('APPROVE')}>Approve & complete</Button></>:null}{task.control_state==='SCHEDULED'?<><Button variant="outline" loading={busy} onClick={()=>void control('CANCEL')}>Cancel</Button><Button loading={busy} onClick={()=>void control('DISPATCH_NOW')}>Dispatch now</Button></>:null}{task.control_state==='ACTIVE'&&!['COMPLETED','CANCELLED'].includes(task.status)&&task.status!=='AWAITING_RESPONSE'?<><Button variant="outline" loading={busy} onClick={()=>void control('PAUSE')}>Pause</Button><Button variant="outline" loading={busy} onClick={()=>void control('CANCEL')}>Cancel</Button><Button loading={busy} onClick={()=>void control('COMPLETE')}>Mark completed</Button></>:null}{task.control_state==='PAUSED'?<><Button variant="outline" loading={busy} onClick={()=>void control('CANCEL')}>Cancel</Button><Button loading={busy} onClick={()=>void control('RESUME')}>Resume task</Button></>:null}{task.status==='COMPLETED'||task.control_state==='CANCELLED'?<Button loading={busy} onClick={()=>void control('REOPEN')}>Reopen task</Button>:null}</div></Card>
}

function StaffControls({task,currentUserId,busy,action}:{task:TaskDetail;currentUserId:string|null;busy:boolean;action:(a:'accept'|'start'|'submit')=>Promise<void>}){
  const locked=Boolean(task.accepted_by_id&&currentUserId&&task.accepted_by_id!==currentUserId);
  return <Card className="workspace-card p26-task-control-center"><div><span className="eyebrow">Your work sequence</span><h2>{task.control_state==='PAUSED'?'Task paused by Admin':task.control_state==='CANCELLED'?'Task cancelled':task.control_state==='ACTIVE'?'Accept → Start → Submit':'Task not available yet'}</h2><p>{task.assignment_type==='TEAM'||task.assignment_type==='DEPARTMENT'?'For shared work, the first eligible staff member to accept becomes the accountable worker.':'Progress your task through the controlled delivery flow.'}</p></div><div className="p26-task-control-actions">{task.control_state==='ACTIVE'&&!task.accepted_at?<Button loading={busy} onClick={()=>void action('accept')}>Accept task</Button>:null}{task.control_state==='ACTIVE'&&!locked&&task.accepted_at&&task.status==='TODO'?<Button loading={busy} onClick={()=>void action('start')}>Start work</Button>:null}{task.control_state==='ACTIVE'&&!locked&&(task.status==='IN_PROGRESS'||task.status==='BLOCKED')?<Button loading={busy} onClick={()=>void action('submit')}>Submit for review</Button>:null}{task.status==='AWAITING_RESPONSE'?<Badge tone="warning">Awaiting Admin review</Badge>:null}{task.status==='COMPLETED'?<Badge tone="success">Completed</Badge>:null}{locked?<Badge tone="neutral">Accepted by another staff member</Badge>:null}</div></Card>
}

function EditTaskModal({open,task,onClose,onSaved}:{open:boolean;task:TaskDetail;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [title,setTitle]=useState(task.title);const [description,setDescription]=useState(task.description??'');const [priority,setPriority]=useState(task.priority);const [dueAt,setDueAt]=useState(task.due_at?new Date(task.due_at).toISOString().slice(0,16):'');const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);
  return <Modal open={open} onClose={onClose} title="Edit task"><form className="premium-form" onSubmit={async e=>{e.preventDefault();setSaving(true);setError(null);try{await updateTask(task.id,{title,description:description||null,priority,dueAt:dueAt?new Date(dueAt).toISOString():null},false);await onSaved()}catch(x){setError(x instanceof Error?x.message:'Unable to update task');setSaving(false)}}}><label className="ui-field"><span className="ui-label">Title</span><input className="ui-input" value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="ui-field"><span className="ui-label">Instructions</span><textarea className="ui-input" rows={6} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="task-form-grid"><label className="ui-field"><span className="ui-label">Priority</span><select className="ui-input" value={priority} onChange={e=>setPriority(e.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label className="ui-field"><span className="ui-label">Due</span><input className="ui-input" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label></div>{error?<p className="task-form-error">{error}</p>:null}<div className="task-form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div></form></Modal>
}

function assignmentName(task:TaskDetail){if(task.assignment_type==='TEAM')return task.assigned_team_name||'Team';if(task.assignment_type==='DEPARTMENT')return task.assigned_department_name||'Department';if(task.assignment_type==='STAFF')return person(task.assignee_first_name,task.assignee_last_name);return 'Unassigned'}
