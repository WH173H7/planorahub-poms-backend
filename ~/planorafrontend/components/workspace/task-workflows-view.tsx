'use client';

import Link from 'next/link';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {EmptyState} from '@/components/ui/empty-state';
import {archiveTaskWorkflow,listTaskWorkflows,type TaskWorkflow} from '@/lib/workspace/api';

const scopeName=(w:TaskWorkflow)=>w.scope_type==='ROLE'?(w.role_name||'Role'):w.scope_type==='TEAM'?(w.team_name||'Team'):w.scope_type==='DEPARTMENT'?(w.department_name||'Department'):'Company-wide';

export function TaskWorkflowsView(){
  const [rows,setRows]=useState<TaskWorkflow[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [scope,setScope]=useState<'ALL'|'GENERAL'|'ROLE'|'TEAM'|'DEPARTMENT'>('ALL');
  const load=useCallback(async()=>{try{setRows(await listTaskWorkflows(true));setError(null)}catch(e){setError(e instanceof Error?e.message:'Unable to load task workflows')}},[]);
  useEffect(()=>{void load()},[load]);
  const filtered=useMemo(()=>scope==='ALL'?rows:rows.filter(w=>w.scope_type===scope),[rows,scope]);
  const counts=useMemo(()=>({GENERAL:rows.filter(x=>x.is_active&&x.scope_type==='GENERAL').length,ROLE:rows.filter(x=>x.is_active&&x.scope_type==='ROLE').length,TEAM:rows.filter(x=>x.is_active&&x.scope_type==='TEAM').length,DEPARTMENT:rows.filter(x=>x.is_active&&x.scope_type==='DEPARTMENT').length}),[rows]);

  return <AppShell area="admin" title="Task Workflows" breadcrumb="Work / Tasks" description="Create repeatable work guides and bind them to the Roles, Teams or Departments that actually use them." actions={<Link href="/task-workflows/new"><Button>+ New Workflow</Button></Link>}>
    <div className="task-workflows-page">
      <div className="task-workflow-summary-grid"><Card><span>Company-wide</span><strong>{counts.GENERAL}</strong><small>Reusable anywhere</small></Card><Card><span>Role workflows</span><strong>{counts.ROLE}</strong><small>Matched to staff roles</small></Card><Card><span>Team workflows</span><strong>{counts.TEAM}</strong><small>For shared Team work</small></Card><Card><span>Department workflows</span><strong>{counts.DEPARTMENT}</strong><small>For department operations</small></Card></div>
      <Card className="workspace-card task-workflow-filter-card"><div><span className="eyebrow">Workflow library</span><h2>Choose the process by how work is assigned</h2><p>When a task is assigned to Staff, only General and that Staff member’s Role workflows appear. Team and Department tasks follow the same rule.</p></div><div className="task-workflow-filter-tabs">{(['ALL','GENERAL','ROLE','TEAM','DEPARTMENT'] as const).map(x=><button type="button" key={x} className={scope===x?'is-active':''} onClick={()=>setScope(x)}>{x==='ALL'?'All':x==='GENERAL'?'General':x[0]+x.slice(1).toLowerCase()}</button>)}</div></Card>
      {error?<Card className="workspace-card"><p className="task-form-error">{error}</p></Card>:null}
      <div className="workflow-library-grid p26-workflow-grid">{filtered.map(w=><Card className="workflow-library-card p26-workflow-card" key={w.id}><div className="workflow-library-head"><div><div className="p26-workflow-badges"><Badge tone="purple">{w.scope_type==='GENERAL'?'General':w.scope_type[0]+w.scope_type.slice(1).toLowerCase()}</Badge>{w.is_default_for_scope?<Badge tone="success">Default</Badge>:null}{!w.is_active?<Badge tone="neutral">Archived</Badge>:null}</div><h2>{w.name}</h2><p>{w.description||'Reusable process guide'}</p></div><div className="p26-workflow-scope"><small>Used by</small><strong>{scopeName(w)}</strong></div></div><div className="p26-workflow-meta"><span>{w.category||'Operations'}</span><span>{w.steps.length} step{w.steps.length===1?'':'s'}</span></div><ol>{w.steps.slice(0,4).map(s=><li key={s.id}><span>{s.position}</span><div><strong>{s.title}</strong>{s.guidance?<small>{s.guidance}</small>:null}</div></li>)}</ol>{w.steps.length>4?<p className="muted">+ {w.steps.length-4} more steps</p>:null}<div className="workflow-library-actions"><Link href={`/task-workflows/${w.id}`}><Button variant="outline" size="sm">Open workflow</Button></Link>{w.is_active?<Button variant="ghost" size="sm" onClick={async()=>{if(window.confirm(`Archive ${w.name}?`)){await archiveTaskWorkflow(w.id);await load()}}}>Archive</Button>:null}</div></Card>)}</div>
      {!filtered.length&&!error?<EmptyState icon="tasks" title="No matching workflows" description="Create a Role, Team, Department or general workflow for repeatable work."/>:null}
    </div>
  </AppShell>;
}
