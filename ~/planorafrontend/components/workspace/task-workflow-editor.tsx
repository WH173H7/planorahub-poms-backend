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
import {PageLoadingState} from '@/components/ui/page-state';
import {createTaskWorkflow,getTaskWorkflow,updateTaskWorkflow} from '@/lib/workspace/api';
import {listRoles} from '@/lib/staff/api';
import {listManagedDepartments,listManagedTeams} from '@/lib/workspace/ops-api';

type DraftStep={title:string;guidance:string;requiresEvidence:boolean};
type ScopeType='GENERAL'|'ROLE'|'TEAM'|'DEPARTMENT';

export function TaskWorkflowEditor({workflowId}:{workflowId?:string}){
  const router=useRouter();
  const [loading,setLoading]=useState(Boolean(workflowId));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [roles,setRoles]=useState<any[]>([]);
  const [teams,setTeams]=useState<any[]>([]);
  const [departments,setDepartments]=useState<any[]>([]);
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [category,setCategory]=useState('');
  const [scopeType,setScopeType]=useState<ScopeType>('GENERAL');
  const [scopeId,setScopeId]=useState('');
  const [isDefault,setIsDefault]=useState(false);
  const [isActive,setIsActive]=useState(true);
  const [steps,setSteps]=useState<DraftStep[]>([{title:'',guidance:'',requiresEvidence:false}]);

  useEffect(()=>{
    let active=true;
    Promise.all([listRoles(),listManagedTeams(),listManagedDepartments()]).then(([r,t,d])=>{if(!active)return;setRoles(r.filter(x=>x.is_active!==false&&x.code!=='SUPER_ADMIN'));setTeams(t.filter(x=>x.is_active!==false));setDepartments(d.filter(x=>x.is_active!==false));}).catch(()=>{});
    if(workflowId){
      getTaskWorkflow(workflowId).then(w=>{if(!active)return;setName(w.name);setDescription(w.description??'');setCategory(w.category??'');setScopeType(w.scope_type);setScopeId(w.role_id??w.team_id??w.department_id??'');setIsDefault(Boolean(w.is_default_for_scope));setIsActive(Boolean(w.is_active));setSteps(w.steps.map(s=>({title:s.title,guidance:s.guidance??'',requiresEvidence:s.requires_evidence})));setLoading(false)}).catch(e=>{if(active){setError(e instanceof Error?e.message:'Unable to load workflow');setLoading(false)}});
    }
    return()=>{active=false};
  },[workflowId]);

  const scopeOptions=useMemo(()=>scopeType==='ROLE'?roles:scopeType==='TEAM'?teams:scopeType==='DEPARTMENT'?departments:[],[scopeType,roles,teams,departments]);
  const scopeLabel=scopeType==='ROLE'?'Role':scopeType==='TEAM'?'Team':scopeType==='DEPARTMENT'?'Department':'Company';

  async function save(){
    setSaving(true);setError(null);
    try{
      const payload:any={name,description,category,scopeType,isDefaultForScope:isDefault,isActive,steps};
      if(scopeType==='ROLE')payload.roleId=scopeId;
      if(scopeType==='TEAM')payload.teamId=scopeId;
      if(scopeType==='DEPARTMENT')payload.departmentId=scopeId;
      if(workflowId)await updateTaskWorkflow(workflowId,payload);else await createTaskWorkflow(payload);
      router.push('/task-workflows');
    }catch(e){setError(e instanceof Error?e.message:'Unable to save workflow');setSaving(false)}
  }

  if(loading)return <AppShell area="admin" title="Task Workflow" breadcrumb="Work / Tasks"><PageLoadingState/></AppShell>;

  return <AppShell area="admin" title={workflowId?'Edit Task Workflow':'New Task Workflow'} breadcrumb="Work / Tasks" description="Build reusable work guides around the people who actually perform them.">
    <div className="task-workflow-editor-page">
      <Card className="workspace-card task-workflow-editor-intro">
        <div><span className="eyebrow">Workflow identity</span><h2>{workflowId?'Refine this process':'Create a reusable process'}</h2><p>Role workflows appear only when assigning work to staff in that role. Team and Department workflows appear only for those targets.</p></div>
        <Badge tone="purple">{scopeLabel} workflow</Badge>
      </Card>

      <div className="task-workflow-editor-layout">
        <main className="task-workflow-editor-main">
          <Card className="workspace-card task-workflow-section">
            <header><div><span className="eyebrow">01 · Basics</span><h2>Workflow details</h2></div></header>
            <div className="task-form-grid"><Input label="Workflow name *" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Monthly campaign reporting"/><Input label="Category" value={category} onChange={e=>setCategory(e.target.value)} placeholder="Marketing, Engineering, Operations…"/></div>
            <Textarea label="What this workflow is for" value={description} onChange={e=>setDescription(e.target.value)} rows={4}/>
          </Card>

          <Card className="workspace-card task-workflow-section">
            <header><div><span className="eyebrow">02 · Audience</span><h2>Who should use this workflow?</h2><p>Scope determines when this workflow appears while creating a task.</p></div></header>
            <div className="task-scope-options">
              {(['GENERAL','ROLE','TEAM','DEPARTMENT'] as ScopeType[]).map(type=><button type="button" key={type} className={scopeType===type?'task-scope-option is-active':'task-scope-option'} onClick={()=>{setScopeType(type);setScopeId('')}}><strong>{type==='GENERAL'?'General':type[0]+type.slice(1).toLowerCase()}</strong><span>{type==='GENERAL'?'Available for any task':type==='ROLE'?'Shown for staff in one role':type==='TEAM'?'Built for one Team':'Built for one Department'}</span></button>)}
            </div>
            {scopeType!=='GENERAL'?<NativeSelect label={`${scopeLabel} *`} value={scopeId} onChange={e=>setScopeId(e.target.value)}><option value="">Choose {scopeLabel.toLowerCase()}</option>{scopeOptions.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>:null}
            <div className="task-workflow-toggle-stack"><label className="task-default-toggle"><input type="checkbox" checked={isDefault} onChange={e=>setIsDefault(e.target.checked)}/><span><strong>Default for this scope</strong><small>Preselect this workflow when a matching task is created.</small></span></label><label className="task-default-toggle"><input type="checkbox" checked={isActive} onChange={e=>setIsActive(e.target.checked)}/><span><strong>Active workflow</strong><small>Inactive workflows stay in the library but cannot be selected for new tasks.</small></span></label></div>
          </Card>

          <Card className="workspace-card task-workflow-section">
            <header className="task-workflow-steps-head"><div><span className="eyebrow">03 · Process</span><h2>Workflow steps</h2><p>Keep each step outcome-focused so staff always know what “done” means.</p></div><Button type="button" variant="outline" onClick={()=>setSteps(v=>[...v,{title:'',guidance:'',requiresEvidence:false}])}>+ Add step</Button></header>
            <div className="task-workflow-step-list">{steps.map((step,index)=><article className="task-workflow-step-card" key={index}><div className="task-workflow-step-number">{String(index+1).padStart(2,'0')}</div><div className="task-workflow-step-fields"><Input label="Step title *" value={step.title} onChange={e=>setSteps(v=>v.map((x,i)=>i===index?{...x,title:e.target.value}:x))} placeholder="What should happen?"/><Textarea label="Guidance" rows={3} value={step.guidance} onChange={e=>setSteps(v=>v.map((x,i)=>i===index?{...x,guidance:e.target.value}:x))} placeholder="Helpful detail, acceptance notes or context…"/><label className="inline-check"><input type="checkbox" checked={step.requiresEvidence} onChange={e=>setSteps(v=>v.map((x,i)=>i===index?{...x,requiresEvidence:e.target.checked}:x))}/> Evidence or a supporting file is normally expected</label></div><div className="task-workflow-step-actions">{index>0?<button type="button" onClick={()=>setSteps(v=>{const n=[...v];[n[index-1],n[index]]=[n[index],n[index-1]];return n})}>↑</button>:null}{index<steps.length-1?<button type="button" onClick={()=>setSteps(v=>{const n=[...v];[n[index+1],n[index]]=[n[index],n[index+1]];return n})}>↓</button>:null}{steps.length>1?<button type="button" className="danger" onClick={()=>setSteps(v=>v.filter((_,i)=>i!==index))}>Remove</button>:null}</div></article>)}</div>
          </Card>
        </main>

        <aside className="task-workflow-editor-side">
          <Card className="workspace-card task-workflow-save-card"><span className="eyebrow">Ready to save</span><h3>{name||'Untitled workflow'}</h3><dl><div><dt>Scope</dt><dd>{scopeLabel}</dd></div><div><dt>Steps</dt><dd>{steps.length}</dd></div><div><dt>Default</dt><dd>{isDefault?'Yes':'No'}</dd></div><div><dt>Status</dt><dd>{isActive?'Active':'Archived'}</dd></div></dl>{error?<p className="task-form-error">{error}</p>:null}<Button loading={saving} onClick={()=>void save()}>{workflowId?'Save changes':'Create workflow'}</Button><Button variant="outline" onClick={()=>router.push('/task-workflows')}>Cancel</Button></Card>
        </aside>
      </div>
    </div>
  </AppShell>;
}
