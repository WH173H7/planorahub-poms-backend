'use client';

import Link from 'next/link';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AppShell} from '@/components/shell/app-shell';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {EmptyState} from '@/components/ui/empty-state';
import {NativeSelect} from '@/components/ui/native-select';
import {PageErrorState,PageLoadingState} from '@/components/ui/page-state';
import {getCurrentCrmUser} from '@/lib/auth/current-user';
import {hasAdministrativeAccess} from '@/lib/auth/routing';
import {listTasks} from '@/lib/leads/api';
import {formatDate} from '@/lib/leads/helpers';
import type {TaskDetail} from '@/lib/leads/types';

type Filter='ALL'|'ACTIVE'|'SCHEDULED'|'PAUSED'|'OVERDUE'|'COMPLETED';
const human=(v:string)=>v.replaceAll('_',' ').toLowerCase().replace(/^./,x=>x.toUpperCase());
const statusTone=(s:string)=>s==='COMPLETED'?'success':s==='BLOCKED'||s==='CANCELLED'?'danger':s==='IN_PROGRESS'?'info':s==='AWAITING_RESPONSE'?'warning':'neutral';
const priorityTone=(s:string)=>s==='URGENT'?'danger':s==='HIGH'?'warning':s==='MEDIUM'?'purple':'neutral';

export function TasksView(){
  const router=useRouter();
  const [staffMode,setStaffMode]=useState<boolean|null>(null);
  const [rows,setRows]=useState<TaskDetail[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [filter,setFilter]=useState<Filter>('ALL');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('ALL');
  const load=useCallback(async()=>{try{const user=await getCurrentCrmUser();const isStaff=!hasAdministrativeAccess(user);setStaffMode(isStaff);setRows(await listTasks(isStaff));setError(null)}catch(e){setError(e instanceof Error?e.message:'Unable to load tasks')}},[]);
  useEffect(()=>{void load()},[load]);

  const now=Date.now();
  const counts=useMemo(()=>({
    all:rows.length,
    active:rows.filter(x=>x.control_state==='ACTIVE'&&!['COMPLETED','CANCELLED'].includes(x.status)).length,
    scheduled:rows.filter(x=>x.control_state==='SCHEDULED').length,
    paused:rows.filter(x=>x.control_state==='PAUSED').length,
    overdue:rows.filter(x=>x.control_state==='ACTIVE'&&x.status!=='COMPLETED'&&x.status!=='CANCELLED'&&x.due_at&&new Date(x.due_at).getTime()<now).length,
    completed:rows.filter(x=>x.status==='COMPLETED').length,
  }),[rows,now]);

  const filtered=useMemo(()=>rows.filter(task=>{
    if(filter==='ACTIVE'&&!(task.control_state==='ACTIVE'&&!['COMPLETED','CANCELLED'].includes(task.status)))return false;
    if(filter==='SCHEDULED'&&task.control_state!=='SCHEDULED')return false;
    if(filter==='PAUSED'&&task.control_state!=='PAUSED')return false;
    if(filter==='OVERDUE'&&!(task.control_state==='ACTIVE'&&task.status!=='COMPLETED'&&task.status!=='CANCELLED'&&task.due_at&&new Date(task.due_at).getTime()<now))return false;
    if(filter==='COMPLETED'&&task.status!=='COMPLETED')return false;
    if(status!=='ALL'&&task.status!==status)return false;
    const target=assignmentName(task);
    const needle=search.trim().toLowerCase();
    return !needle||[task.title,task.description,task.organization_name,task.lead_title,target,task.task_workflow_name].filter(Boolean).join(' ').toLowerCase().includes(needle);
  }),[rows,filter,status,search,now]);

  if(staffMode===null)return <main><PageLoadingState/></main>;
  if(error)return <AppShell area={staffMode?'staff':'admin'} title="Tasks" breadcrumb="Work"><PageErrorState message={error}/></AppShell>;

  return <AppShell area={staffMode?'staff':'admin'} title="Tasks" breadcrumb="Work" description={staffMode?'Your assigned and shared work, process guides and deadlines in one focused workspace.':'Plan, schedule and control work across Staff, Teams and Departments.'} actions={!staffMode?<><Link href="/task-workflows"><Button variant="outline">Task Workflows</Button></Link><Link href="/tasks/new"><Button>+ New Task</Button></Link></>:undefined}>
    <div className="p26-tasks-page">
      <div className="p26-task-metrics">
        <Metric label="All tasks" value={counts.all} active={filter==='ALL'} onClick={()=>setFilter('ALL')}/>
        <Metric label="Active" value={counts.active} active={filter==='ACTIVE'} onClick={()=>setFilter('ACTIVE')}/>
        {!staffMode?<Metric label="Scheduled" value={counts.scheduled} active={filter==='SCHEDULED'} onClick={()=>setFilter('SCHEDULED')}/>:null}
        <Metric label="Paused" value={counts.paused} active={filter==='PAUSED'} onClick={()=>setFilter('PAUSED')}/>
        <Metric label="Overdue" value={counts.overdue} tone="danger" active={filter==='OVERDUE'} onClick={()=>setFilter('OVERDUE')}/>
        <Metric label="Completed" value={counts.completed} tone="success" active={filter==='COMPLETED'} onClick={()=>setFilter('COMPLETED')}/>
      </div>

      <Card className="workspace-card p26-task-workspace">
        <div className="p26-task-toolbar"><div className="tasks-search"><span>⌕</span><input type="search" placeholder="Search tasks, assignees, context or workflows…" value={search} onChange={e=>setSearch(e.target.value)}/></div><NativeSelect aria-label="Task status" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All statuses</option><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="AWAITING_RESPONSE">Submitted for review</option><option value="BLOCKED">Blocked / revision</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></NativeSelect></div>
        {filtered.length?<><div className="p26-task-table-wrap"><table className="p26-task-table"><thead><tr><th>Task</th><th>Routing</th><th>Workflow</th><th>State</th><th>Priority</th><th>Due / dispatch</th></tr></thead><tbody>{filtered.map(task=><tr key={task.id} tabIndex={0} onClick={()=>router.push(`/tasks/${task.id}`)} onKeyDown={e=>{if(e.key==='Enter')router.push(`/tasks/${task.id}`)}}><td><strong>{task.title}</strong><span>{task.lead_title||task.organization_name||'General company work'}</span></td><td><strong>{assignmentName(task)}</strong><span>{human(task.assignment_type)}</span></td><td>{task.task_workflow_name?<><strong>{task.task_workflow_name}</strong>{task.assignee_role_name?<span>{task.assignee_role_name}</span>:null}</>:<span>—</span>}</td><td><div className="p26-task-state-cell"><Badge tone={controlTone(task.control_state)}>{human(task.control_state)}</Badge><Badge tone={statusTone(task.status)}>{task.status==='AWAITING_RESPONSE'?'Review':human(task.status)}</Badge></div></td><td><Badge tone={priorityTone(task.priority)}>{human(task.priority)}</Badge></td><td><strong className={isOverdue(task)?'overdue-text':''}>{task.control_state==='SCHEDULED'&&task.scheduled_for?formatDate(task.scheduled_for):task.due_at?formatDate(task.due_at):'No deadline'}</strong><span>{task.control_state==='SCHEDULED'?'Scheduled dispatch':'Due date'}</span></td></tr>)}</tbody></table></div><div className="p26-task-mobile-grid">{filtered.map(task=><Link key={task.id} href={`/tasks/${task.id}`} className="p26-task-mobile-card"><div className="p26-task-mobile-head"><div><span className="eyebrow">{assignmentName(task)}</span><h3>{task.title}</h3></div><Badge tone={controlTone(task.control_state)}>{human(task.control_state)}</Badge></div><p>{task.description||task.lead_title||task.organization_name||'General company work'}</p><div className="p26-task-mobile-meta"><Badge tone={priorityTone(task.priority)}>{human(task.priority)}</Badge><Badge tone={statusTone(task.status)}>{task.status==='AWAITING_RESPONSE'?'Review':human(task.status)}</Badge>{task.task_workflow_name?<Badge tone="purple">{task.task_workflow_name}</Badge>:null}</div><dl><div><dt>Due</dt><dd>{task.due_at?formatDate(task.due_at):'—'}</dd></div><div><dt>Assignment</dt><dd>{human(task.assignment_type)}</dd></div></dl></Link>)}</div></>:<EmptyState icon="tasks" title="No matching tasks" description="Try changing the filters, or create a new task."/>}
      </Card>
    </div>
  </AppShell>;
}

function Metric({label,value,active,onClick,tone}:{label:string;value:number;active:boolean;onClick:()=>void;tone?:'danger'|'success'}){return <button type="button" className={`p26-task-metric ${active?'is-active':''} ${tone?`is-${tone}`:''}`} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>}
function assignmentName(task:TaskDetail){if(task.assignment_type==='TEAM')return task.assigned_team_name||'Team';if(task.assignment_type==='DEPARTMENT')return task.assigned_department_name||'Department';if(task.assignment_type==='STAFF')return [task.assignee_first_name,task.assignee_last_name].filter(Boolean).join(' ')||'Staff';return 'Unassigned'}
function isOverdue(task:TaskDetail){return Boolean(task.control_state==='ACTIVE'&&task.status!=='COMPLETED'&&task.status!=='CANCELLED'&&task.due_at&&new Date(task.due_at).getTime()<Date.now())}
function controlTone(state:string):'neutral'|'warning'|'danger'|'success'|'info'|'purple'{return state==='PAUSED'?'warning':state==='CANCELLED'?'danger':state==='SCHEDULED'?'info':state==='ACTIVE'?'success':'neutral'}
