'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AppShell} from '@/components/shell/app-shell';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {Textarea} from '@/components/ui/textarea';
import {createTask,listAssignmentStaff,listContacts,listLeads,listOrganizations,uploadTaskAttachment} from '@/lib/leads/api';
import type {AssignmentStaff,Lead} from '@/lib/leads/types';
import {createTaskWorkflow,listEligibleTaskWorkflows,type TaskWorkflow} from '@/lib/workspace/api';
import {listManagedDepartments,listManagedTeams} from '@/lib/workspace/ops-api';

type AssignmentType='UNASSIGNED'|'STAFF'|'TEAM'|'DEPARTMENT';
type RelationType='NONE'|'LEAD'|'ORGANIZATION'|'CONTACT';
type CustomStep={title:string;guidance:string;requiresEvidence:boolean};

export function TaskCreateView(){
  const router=useRouter();
  const [staff,setStaff]=useState<AssignmentStaff[]>([]);
  const [teams,setTeams]=useState<any[]>([]);
  const [departments,setDepartments]=useState<any[]>([]);
  const [leads,setLeads]=useState<Lead[]>([]);
  const [organizations,setOrganizations]=useState<Array<{id:string;name:string}>>([]);
  const [contacts,setContacts]=useState<Array<{id:string;organization_id:string;organization_name:string;first_name:string;last_name:string;job_title:string|null}>>([]);
  const [workflows,setWorkflows]=useState<TaskWorkflow[]>([]);
  const [assignmentType,setAssignmentType]=useState<AssignmentType>('STAFF');
  const [targetId,setTargetId]=useState('');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [priority,setPriority]=useState('MEDIUM');
  const [dueAt,setDueAt]=useState('');
  const [scheduleMode,setScheduleMode]=useState<'NOW'|'LATER'>('NOW');
  const [scheduledFor,setScheduledFor]=useState('');
  const [workflowId,setWorkflowId]=useState('');
  const [relationType,setRelationType]=useState<RelationType>('NONE');
  const [relationId,setRelationId]=useState('');
  const [files,setFiles]=useState<File[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [customOpen,setCustomOpen]=useState(false);
  const [customName,setCustomName]=useState('');
  const [customDescription,setCustomDescription]=useState('');
  const [customSteps,setCustomSteps]=useState<CustomStep[]>([{title:'',guidance:'',requiresEvidence:false}]);
  const [customSaving,setCustomSaving]=useState(false);

  useEffect(()=>{Promise.all([listAssignmentStaff(),listManagedTeams(),listManagedDepartments(),listLeads(),listOrganizations(),listContacts()]).then(([s,t,d,l,o,c])=>{setStaff(s.filter(x=>x.status==='ACTIVE'||x.status==='INVITED'));setTeams(t.filter((x:any)=>x.is_active!==false));setDepartments(d.filter((x:any)=>x.is_active!==false));setLeads(l);setOrganizations(o);setContacts(c)}).catch(e=>setError(e instanceof Error?e.message:'Unable to load task options'))},[]);

  useEffect(()=>{
    setWorkflowId('');
    if(assignmentType==='UNASSIGNED'){setWorkflows([]);return;}
    const input:any={assignmentType};
    if(assignmentType==='STAFF'&&targetId)input.staffId=targetId;
    if(assignmentType==='TEAM'&&targetId)input.teamId=targetId;
    if(assignmentType==='DEPARTMENT'&&targetId)input.departmentId=targetId;
    if(!targetId){setWorkflows([]);return;}
    listEligibleTaskWorkflows(input).then(rows=>{setWorkflows(rows);const def=rows.find(x=>x.is_default_for_scope);if(def)setWorkflowId(def.id)}).catch(()=>setWorkflows([]));
  },[assignmentType,targetId]);

  const selectedStaff=staff.find(x=>x.id===targetId);
  const targetOptions=assignmentType==='STAFF'?staff:assignmentType==='TEAM'?teams:assignmentType==='DEPARTMENT'?departments:[];
  const targetLabel=assignmentType==='STAFF'?'Staff member':assignmentType==='TEAM'?'Team':assignmentType==='DEPARTMENT'?'Department':'Assignment';
  const selectedWorkflow=workflows.find(x=>x.id===workflowId);
  const canCreate=Boolean(title.trim()&&(assignmentType==='UNASSIGNED'||targetId)&&(scheduleMode==='NOW'||scheduledFor));
  const canCreateCustom=Boolean(customName.trim()&&customSteps.length&&customSteps.every(x=>x.title.trim()));
  const relationOptions=relationType==='LEAD'?leads.map((x:any)=>({id:x.id,label:x.organization_name||x.title||'Lead'})):relationType==='ORGANIZATION'?organizations.map(x=>({id:x.id,label:x.name})):relationType==='CONTACT'?contacts.map(x=>({id:x.id,label:`${x.first_name} ${x.last_name} · ${x.organization_name}`})):[];

  async function createCustomWorkflow(){
    if(!['TEAM','DEPARTMENT'].includes(assignmentType)||!targetId)return;
    setCustomSaving(true);setError(null);
    try{
      const payload:any={name:customName,description:customDescription,category:assignmentType==='TEAM'?'Team work':'Department work',scopeType:assignmentType,isDefaultForScope:false,steps:customSteps};
      if(assignmentType==='TEAM')payload.teamId=targetId;else payload.departmentId=targetId;
      const created=await createTaskWorkflow(payload);
      const input:any={assignmentType};if(assignmentType==='TEAM')input.teamId=targetId;else input.departmentId=targetId;
      const rows=await listEligibleTaskWorkflows(input);setWorkflows(rows);setWorkflowId(created.id);setCustomOpen(false);setCustomName('');setCustomDescription('');setCustomSteps([{title:'',guidance:'',requiresEvidence:false}]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to create workflow')}finally{setCustomSaving(false)}
  }

  async function submit(){
    setSaving(true);setError(null);
    try{
      const payload:any={title:title.trim(),description:description.trim()||null,priority,dueAt:dueAt?new Date(dueAt).toISOString():null,taskWorkflowId:workflowId||null,assignmentType,scheduledFor:scheduleMode==='LATER'&&scheduledFor?new Date(scheduledFor).toISOString():null};
      if(assignmentType==='STAFF')payload.assignedToId=targetId;
      if(assignmentType==='TEAM')payload.assignedTeamId=targetId;
      if(assignmentType==='DEPARTMENT')payload.assignedDepartmentId=targetId;
      if(relationType==='LEAD'){const lead:any=leads.find((x:any)=>x.id===relationId);payload.leadId=relationId;payload.organizationId=lead?.organization_id??null;}
      if(relationType==='ORGANIZATION')payload.organizationId=relationId;
      if(relationType==='CONTACT'){const contact=contacts.find(x=>x.id===relationId);payload.contactId=relationId;payload.organizationId=contact?.organization_id??null;}
      const task=await createTask(payload);
      for(const file of files)await uploadTaskAttachment(task.id,file,false);
      router.push(`/tasks/${task.id}`);
    }catch(e){setError(e instanceof Error?e.message:'Unable to create task');setSaving(false)}
  }

  return <AppShell area="admin" title="Create Task" breadcrumb="Work / Tasks" description="Route work to the right person or group, attach the right process and control when it becomes visible.">
    <div className="task-create-page">
      <div className="task-create-layout">
        <main className="task-create-main">
          <Card className="workspace-card task-create-section"><header><div><span className="eyebrow">01 · Work brief</span><h2>What needs to happen?</h2><p>Write a clear outcome, not just an activity.</p></div></header><Input label="Task title *" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Prepare September campaign performance report"/><Textarea label="Instructions" value={description} onChange={e=>setDescription(e.target.value)} rows={6} placeholder="What should be delivered? Add acceptance notes, links or context."/><div className="task-form-grid"><NativeSelect label="Priority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></NativeSelect><Input label="Due date" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></div></Card>

          <Card className="workspace-card task-create-section"><header><div><span className="eyebrow">02 · Routing</span><h2>Who owns this work?</h2><p>Staff tasks use workflows for that person’s Role. Team and Department tasks use workflows built for that group.</p></div></header><div className="task-assignment-type-grid">{(['STAFF','TEAM','DEPARTMENT','UNASSIGNED'] as AssignmentType[]).map(type=><button type="button" key={type} className={assignmentType===type?'task-assignment-type is-active':'task-assignment-type'} onClick={()=>{setAssignmentType(type);setTargetId('');setCustomOpen(false);if(type==='UNASSIGNED')setScheduleMode('NOW')}}><strong>{type==='UNASSIGNED'?'Unassigned':type[0]+type.slice(1).toLowerCase()}</strong><span>{type==='STAFF'?'One accountable person':type==='TEAM'?'Shared Team responsibility':type==='DEPARTMENT'?'Department-wide work':'Save without routing yet'}</span></button>)}</div>{assignmentType!=='UNASSIGNED'?<NativeSelect label={`${targetLabel} *`} value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Choose {targetLabel.toLowerCase()}</option>{targetOptions.map((x:any)=><option key={x.id} value={x.id}>{assignmentType==='STAFF'?`${x.first_name} ${x.last_name} · ${x.role_name}`:x.name}</option>)}</NativeSelect>:null}{selectedStaff?<div className="task-role-context"><span className="eyebrow">Role matched workflow</span><strong>{selectedStaff.role_name}</strong><small>{selectedStaff.department_name||'No department'} · {selectedStaff.job_title||'Staff member'}</small></div>:null}</Card>

          <Card className="workspace-card task-create-section"><header><div><span className="eyebrow">03 · Process</span><h2>Attach a workflow</h2><p>Only workflows valid for this assignment are shown.</p></div>{(['TEAM','DEPARTMENT'] as AssignmentType[]).includes(assignmentType)&&targetId?<Button variant="outline" onClick={()=>setCustomOpen(v=>!v)}>{customOpen?'Close builder':'+ Custom workflow'}</Button>:null}</header>{assignmentType==='UNASSIGNED'?<div className="task-empty-context"><strong>Assign the task first</strong><p>Workflow suggestions become available after choosing Staff, a Team or a Department.</p></div>:targetId?<>{workflows.length?<div className="task-workflow-choice-grid"><button type="button" className={!workflowId?'task-workflow-choice is-active':'task-workflow-choice'} onClick={()=>setWorkflowId('')}><strong>No workflow</strong><span>Simple task without a process guide</span></button>{workflows.map(w=><button type="button" key={w.id} className={workflowId===w.id?'task-workflow-choice is-active':'task-workflow-choice'} onClick={()=>setWorkflowId(w.id)}><div><strong>{w.name}</strong>{w.is_default_for_scope?<Badge tone="success">Default</Badge>:null}</div><span>{w.steps.length} steps · {w.scope_type==='GENERAL'?'General':w.scope_type[0]+w.scope_type.slice(1).toLowerCase()}</span></button>)}</div>:<div className="task-empty-context"><strong>No matching workflow yet</strong><p>Create a custom workflow here, or continue without one.</p></div>}{customOpen?<div className="task-inline-workflow-builder"><div className="task-inline-workflow-head"><div><span className="eyebrow">Create without leaving this task</span><h3>{assignmentType==='TEAM'?'Team':'Department'} workflow</h3></div><Badge tone="purple">{targetOptions.find((x:any)=>x.id===targetId)?.name}</Badge></div><Input label="Workflow name *" value={customName} onChange={e=>setCustomName(e.target.value)}/><Textarea label="Purpose" rows={3} value={customDescription} onChange={e=>setCustomDescription(e.target.value)}/><div className="task-inline-step-list">{customSteps.map((step,index)=><div className="task-inline-step" key={index}><span>{index+1}</span><div><Input label="Step" value={step.title} onChange={e=>setCustomSteps(v=>v.map((x,i)=>i===index?{...x,title:e.target.value}:x))}/><Input label="Guidance" value={step.guidance} onChange={e=>setCustomSteps(v=>v.map((x,i)=>i===index?{...x,guidance:e.target.value}:x))}/><label className="inline-check"><input type="checkbox" checked={step.requiresEvidence} onChange={e=>setCustomSteps(v=>v.map((x,i)=>i===index?{...x,requiresEvidence:e.target.checked}:x))}/> Evidence expected</label></div>{customSteps.length>1?<button type="button" onClick={()=>setCustomSteps(v=>v.filter((_,i)=>i!==index))}>Remove</button>:null}</div>)}</div><div className="task-inline-workflow-actions"><Button variant="outline" onClick={()=>setCustomSteps(v=>[...v,{title:'',guidance:'',requiresEvidence:false}])}>+ Step</Button><Button loading={customSaving} disabled={!canCreateCustom} onClick={()=>void createCustomWorkflow()}>Create & select</Button></div></div>:null}</>:<div className="task-empty-context"><strong>Choose a {targetLabel.toLowerCase()}</strong><p>We’ll then show the workflows that match the assignment.</p></div>}</Card>

          <Card className="workspace-card task-create-section"><header><div><span className="eyebrow">04 · Context</span><h2>Connect the task to CRM work</h2><p>Optional, but useful for keeping delivery history beside the right Lead or organization.</p></div></header><div className="task-form-grid"><NativeSelect label="Related to" value={relationType} onChange={e=>{setRelationType(e.target.value as RelationType);setRelationId('')}}><option value="NONE">Nothing / general task</option><option value="LEAD">Lead / Prospect</option><option value="ORGANIZATION">Organization</option><option value="CONTACT">Contact</option></NativeSelect>{relationType!=='NONE'?<NativeSelect label="Record" value={relationId} onChange={e=>setRelationId(e.target.value)}><option value="">Choose record</option>{relationOptions.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</NativeSelect>:<div/>}</div></Card>

          <Card className="workspace-card task-create-section"><header><div><span className="eyebrow">05 · Delivery</span><h2>Send now or schedule it</h2><p>Scheduled tasks remain invisible to staff until their dispatch time.</p></div></header><div className="task-schedule-toggle"><button type="button" className={scheduleMode==='NOW'?'is-active':''} onClick={()=>setScheduleMode('NOW')}><strong>Send now</strong><span>Available immediately</span></button><button type="button" disabled={assignmentType==='UNASSIGNED'} className={scheduleMode==='LATER'?'is-active':''} onClick={()=>setScheduleMode('LATER')}><strong>Schedule</strong><span>Release at a future time</span></button></div>{scheduleMode==='LATER'?<Input label="Dispatch date & time *" type="datetime-local" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)}/>:null}<label className="task-file-drop"><input type="file" multiple hidden onChange={e=>setFiles(Array.from(e.target.files??[]))}/><span>↑</span><strong>{files.length?`${files.length} file${files.length===1?'':'s'} selected`:'Attach supporting files'}</strong><small>PDF, images, Word, Excel or text · up to 10 MB each</small></label>{files.length?<div className="task-selected-files">{files.map((f,i)=><span key={`${f.name}-${i}`}>{f.name}<button type="button" onClick={()=>setFiles(v=>v.filter((_,j)=>j!==i))}>×</button></span>)}</div>:null}</Card>
        </main>

        <aside className="task-create-side"><Card className="workspace-card task-create-summary"><span className="eyebrow">Task summary</span><h3>{title||'Untitled task'}</h3><dl><div><dt>Assigned to</dt><dd>{assignmentType==='UNASSIGNED'?'Unassigned':targetOptions.find((x:any)=>x.id===targetId)?.name??(selectedStaff?`${selectedStaff.first_name} ${selectedStaff.last_name}`:'Not selected')}</dd></div><div><dt>Process</dt><dd>{selectedWorkflow?.name||'No workflow'}</dd></div><div><dt>Delivery</dt><dd>{scheduleMode==='LATER'?'Scheduled':'Send now'}</dd></div><div><dt>Priority</dt><dd>{priority[0]+priority.slice(1).toLowerCase()}</dd></div></dl>{error?<p className="task-form-error">{error}</p>:null}<Button loading={saving} disabled={!canCreate} onClick={()=>void submit()}>Create task</Button><Button variant="outline" onClick={()=>router.push('/tasks')}>Cancel</Button></Card></aside>
      </div>
    </div>
  </AppShell>;
}
