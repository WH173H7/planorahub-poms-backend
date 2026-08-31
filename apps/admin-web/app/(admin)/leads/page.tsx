'use client';

import {
  Building2,
  CalendarClock,
  CheckSquare2,
  FileSpreadsheet,
  FileText,
  Paperclip,
  Plus,
  Search,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Lead = {
  id:string;
  organization_name:string;
  organization_website:string|null;
  industry:string|null;
  assigned_to_id:string|null;
  owner_first_name:string|null;
  owner_last_name:string|null;
  stage:string;
  priority:'LOW'|'MEDIUM'|'HIGH'|'URGENT';
  source:string|null;
  pursuit_progress:number;
  current_assignment_title:string|null;
  current_assignment_task_id:string|null;
  current_assignment_due_at:string|null;
  created_at:string;
};

type Staff = {
  id:string;
  first_name:string;
  last_name:string;
  email:string;
  job_title:string|null;
  status:'INVITED'|'ACTIVE'|'SUSPENDED'|'DISABLED';
  department_name:string|null;
  role_name:string;
};

type Response<T>={success:boolean;data:T};

type BulkAssignmentResult={
  batchId:string;
  taskId:string;
  title:string;
  assignedToId:string;
  leadCount:number;
  dueAt:string;
};

const statusLabels:Record<string,string>={
  NEW:'New',ASSIGNED:'Assigned',RESEARCHING:'Researching',CONTACT_FOUND:'Contact found',
  CONTACTED:'Contacted',AWAITING_REPLY:'Awaiting reply',FOLLOW_UP:'Follow-up',ENGAGED:'Engaged',
  READY_FOR_PROSPECT_REVIEW:'Ready for review',DISQUALIFIED:'Disqualified',
};

const MAX_FILE_BYTES=10*1024*1024;
const ACCEPTED_FILES='.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt';

export default function LeadsPage(){
  const [leads,setLeads]=useState<Lead[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [drawer,setDrawer]=useState(false);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [assignmentOpen,setAssignmentOpen]=useState(false);

  async function load(){
    try{
      setLoading(true);setError(null);
      const r=await apiFetch<Response<Lead[]>>('/admin/leads');
      setLeads(r.data);
      setSelected(prev=>new Set([...prev].filter(id=>r.data.some(lead=>lead.id===id))));
    }catch(e){setError(e instanceof Error?e.message:'Unable to load leads.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  const counts={
    total:leads.length,
    unassigned:leads.filter(l=>!l.assigned_to_id).length,
    assigned:leads.filter(l=>!!l.assigned_to_id).length,
    active:leads.filter(l=>!['NEW','READY_FOR_PROSPECT_REVIEW','DISQUALIFIED'].includes(l.stage)).length,
    review:leads.filter(l=>l.stage==='READY_FOR_PROSPECT_REVIEW').length,
  };

  const filtered=useMemo(()=>leads.filter(l=>{
    const q=search.trim().toLowerCase();
    const text=[l.organization_name,l.organization_website,l.industry,l.source,l.owner_first_name,l.owner_last_name,l.current_assignment_title].filter(Boolean).join(' ').toLowerCase();
    const matches=!q||text.includes(q);
    const state=filter==='ALL'||(filter==='UNASSIGNED'&&!l.assigned_to_id)||(filter==='ASSIGNED'&&!!l.assigned_to_id)||(filter==='REVIEW'&&l.stage==='READY_FOR_PROSPECT_REVIEW')||l.stage===filter;
    return matches&&state;
  }),[leads,search,filter]);

  const allFilteredSelected=filtered.length>0&&filtered.every(l=>selected.has(l.id));
  function toggle(id:string){setSelected(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next;});}
  function toggleAll(){setSelected(prev=>{const next=new Set(prev);if(allFilteredSelected){filtered.forEach(l=>next.delete(l.id));}else{filtered.forEach(l=>next.add(l.id));}return next;});}
  const selectedLeads=leads.filter(l=>selected.has(l.id));

  return <div className="mx-auto max-w-[1550px]">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-[#7a6f7b]">Sales workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Organization Leads</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#726874]">The central pool of organizations PlanoraHub wants the team to research, contact and pursue. Select one or many leads and assign them to a staff member with one clear work brief.</p>
      </div>
      <div className="flex gap-2">
        <button disabled className="inline-flex items-center gap-2 rounded-lg border border-[#ded3df] bg-white px-4 py-2.5 text-sm font-semibold text-[#756b76] opacity-60"><FileSpreadsheet size={17}/>Import CSV / Excel</button>
        <button onClick={()=>setDrawer(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={17}/>Add lead</button>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card label="Total leads" value={counts.total}/><Card label="Unassigned" value={counts.unassigned}/><Card label="Assigned" value={counts.assigned}/><Card label="Active pursuit" value={counts.active}/><Card label="Ready for review" value={counts.review}/>
    </div>

    <div className="mt-6 flex flex-wrap gap-3">
      <div className="relative min-w-[260px] flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#958a96]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search organization, industry, website, source or owner..." className="h-10 w-full rounded-lg border border-[#e3dae4] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#765078]"/></div>
      <select value={filter} onChange={e=>setFilter(e.target.value)} className="h-10 rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"><option value="ALL">All leads</option><option value="UNASSIGNED">Unassigned</option><option value="ASSIGNED">Assigned</option><option value="NEW">New</option><option value="AWAITING_REPLY">Awaiting reply</option><option value="REVIEW">Ready for review</option></select>
      <button disabled={!selected.size} onClick={()=>setAssignmentOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#ded3df] bg-white px-4 text-sm font-semibold transition hover:border-[#765078] disabled:cursor-not-allowed disabled:opacity-45"><UserRoundCheck size={16}/>Bulk assign{selected.size?` (${selected.size})`:''}</button>
    </div>

    {selected.size?<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dccedf] bg-[#f7f1f8] px-4 py-3 text-sm"><span><strong>{selected.size}</strong> organization lead{selected.size===1?'':'s'} selected.</span><div className="flex gap-2"><button onClick={()=>setSelected(new Set())} className="font-semibold text-[#765078]">Clear selection</button><button onClick={()=>setAssignmentOpen(true)} className="rounded-lg bg-[#36133b] px-3 py-2 font-semibold text-white">Assign selected</button></div></div>:null}

    {error?<div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>:null}

    <section className="mt-6 overflow-hidden rounded-2xl border border-[#e9e2ea] bg-white">
      {loading?<div className="flex min-h-[320px] items-center justify-center text-sm text-[#817681]">Loading lead pool...</div>:filtered.length===0?<div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center"><Building2 className="mb-3 text-[#9a839c]"/><p className="font-semibold">No organization leads found</p><p className="mt-1 max-w-md text-sm text-[#817681]">Add the first organization the team should pursue. Contact discovery happens after assignment.</p></div>:<div className="overflow-x-auto"><table className="w-full min-w-[1160px] text-left"><thead className="bg-[#faf7fb]"><tr className="text-xs uppercase tracking-wide text-[#8b818c]"><th className="w-12 px-5 py-3"><input aria-label="Select all visible leads" type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="h-4 w-4 accent-[#36133b]"/></th><th className="px-3 py-3">Organization</th><th className="px-5 py-3">Assigned staff</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Assignment</th><th className="px-5 py-3">Added</th></tr></thead><tbody className="divide-y divide-[#eee8ef]">{filtered.map(l=><tr key={l.id} className={selected.has(l.id)?'bg-[#fbf7fc]':'hover:bg-[#fdfbfd]'}><td className="px-5 py-4"><input aria-label={`Select ${l.organization_name}`} type="checkbox" checked={selected.has(l.id)} onChange={()=>toggle(l.id)} className="h-4 w-4 accent-[#36133b]"/></td><td className="px-3 py-4"><a href={`/leads/${l.id}`} className="font-semibold text-[#36133b] hover:underline">{l.organization_name}</a><p className="mt-1 text-xs text-[#817681]">{l.industry||l.organization_website||'Organization lead'}</p></td><td className="px-5 py-4 text-sm">{l.owner_first_name?`${l.owner_first_name} ${l.owner_last_name??''}`.trim():<span className="font-medium text-amber-700">Unassigned</span>}</td><td className="px-5 py-4"><Badge>{statusLabels[l.stage]||l.stage}</Badge></td><td className="px-5 py-4"><div className="w-32"><div className="mb-1 flex justify-between text-xs"><span>{l.pursuit_progress||0}%</span></div><div className="h-1.5 rounded-full bg-[#eee7ef]"><div className="h-1.5 rounded-full bg-[#765078]" style={{width:`${l.pursuit_progress||0}%`}}/></div></div></td><td className="px-5 py-4 text-sm font-medium">{friendly(l.priority)}</td><td className="px-5 py-4 text-sm">{l.current_assignment_title?<div><p className="max-w-[190px] truncate font-medium text-[#4f3b51]">{l.current_assignment_title}</p>{l.current_assignment_due_at?<p className="mt-1 text-xs text-[#8a7d8b]">Due {new Date(l.current_assignment_due_at).toLocaleDateString()}</p>:null}</div>:<span className="text-[#9b919c]">—</span>}</td><td className="px-5 py-4 text-sm text-[#756b76]">{new Date(l.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
    </section>

    {drawer?<AddLeadDrawer onClose={()=>setDrawer(false)} onSaved={async()=>{setDrawer(false);await load();}}/>:null}
    {assignmentOpen?<AssignmentDrawer leads={selectedLeads} onClose={()=>setAssignmentOpen(false)} onSaved={async()=>{setAssignmentOpen(false);setSelected(new Set());await load();}}/>:null}
  </div>;
}

type WorkflowStep={title:string;description?:string|null;evidence_required?:boolean;evidenceRequired?:boolean};
type Workflow={id:string;name:string;is_default:boolean;steps:WorkflowStep[]};
function AssignmentDrawer({leads,onClose,onSaved}:{leads:Lead[];onClose:()=>void;onSaved:()=>Promise<void>}){
  const [staff,setStaff]=useState<Staff[]>([]),[staffLoading,setStaffLoading]=useState(true);
  const [workflows,setWorkflows]=useState<Workflow[]>([]),[workflowId,setWorkflowId]=useState('');
  const [steps,setSteps]=useState<WorkflowStep[]>([]);
  const [assignedToId,setAssignedToId]=useState(''),[title,setTitle]=useState(''),[instructions,setInstructions]=useState('');
  const [priority,setPriority]=useState<'LOW'|'MEDIUM'|'HIGH'|'URGENT'>('MEDIUM'),[dueAt,setDueAt]=useState('');
  const [files,setFiles]=useState<File[]>([]),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);const fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{(async()=>{try{const [sr,wr]=await Promise.all([apiFetch<Response<Staff[]>>('/admin/staff'),apiFetch<Response<Workflow[]>>('/admin/pursuit-workflows')]);setStaff(sr.data.filter(s=>s.status==='ACTIVE'));setWorkflows(wr.data);const d=wr.data.find(w=>w.is_default)||wr.data[0];if(d){setWorkflowId(d.id);setSteps(d.steps.map(x=>({...x,evidenceRequired:x.evidence_required})));}}catch(e){setError(e instanceof Error?e.message:'Unable to load assignment options.')}finally{setStaffLoading(false)}})()},[]);
  function choose(id:string){setWorkflowId(id);const w=workflows.find(x=>x.id===id);setSteps((w?.steps??[]).map(x=>({...x,evidenceRequired:x.evidence_required})));}
  function addFiles(list:FileList|null){if(!list)return;const next=[...list];const bad=next.find(f=>f.size>MAX_FILE_BYTES);if(bad){setError(`${bad.name} is larger than 10 MB.`);return}setFiles(p=>[...p,...next]);}
  async function submit(e:FormEvent){e.preventDefault();if(!steps.length){setError('Add at least one pursuit step.');return}try{setSaving(true);setError(null);const r=await apiFetch<Response<BulkAssignmentResult>>('/admin/leads/bulk-assign',{method:'POST',body:JSON.stringify({leadIds:leads.map(l=>l.id),assignedToId,title:title.trim(),instructions:instructions.trim(),priority,dueAt:new Date(dueAt).toISOString(),workflowId,workflowSteps:steps.map(s=>({title:s.title,description:s.description??null,evidenceRequired:!!s.evidenceRequired}))})});for(const file of files){const data=new FormData();data.append('file',file,file.name);await apiFetch(`/admin/tasks/${r.data.taskId}/attachments`,{method:'POST',body:data});}await onSaved();}catch(err){setError(err instanceof Error?err.message:'Unable to assign selected leads.')}finally{setSaving(false)}}
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/25"><div className="h-full w-full max-w-3xl overflow-y-auto bg-[#fbf9fc] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e8e0e9] bg-white px-6 py-5"><div><h2 className="text-xl font-semibold">Assign {leads.length} organization lead{leads.length===1?'':'s'}</h2><p className="mt-1 text-xs text-[#817681]">Choose a pursuit workflow, then tailor it for this assignment without changing the original template.</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4eff6]"><X size={19}/></button></div><form onSubmit={submit} className="space-y-6 p-6 pb-24">
  {error?<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>:null}
  <section className="rounded-xl border border-[#e6dce7] bg-white p-4"><div className="flex items-center gap-2"><CheckSquare2 size={17}/><h3 className="font-semibold">Selected leads</h3></div><div className="mt-3 flex flex-wrap gap-2">{leads.map(l=><span key={l.id} className="rounded-full bg-[#f4eff6] px-3 py-1.5 text-xs font-medium">{l.organization_name}</span>)}</div></section>
  <label className="block text-sm font-medium">Assigned staff *<select required disabled={staffLoading} value={assignedToId} onChange={e=>setAssignedToId(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#ddd3de] bg-white px-3 font-normal"><option value="">Select staff member</option>{staff.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name} — {s.job_title||s.department_name||s.role_name}</option>)}</select></label>
  <Field label="Assignment title *" value={title} onChange={setTitle} required placeholder="September partnership outreach"/>
  <label className="block text-sm font-medium">Instructions *<textarea required value={instructions} onChange={e=>setInstructions(e.target.value)} rows={5} className="mt-2 w-full rounded-lg border border-[#ddd3de] bg-white p-3 font-normal"/></label>
  <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Priority<select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)} className="mt-2 h-11 w-full rounded-lg border border-[#ddd3de] bg-white px-3 font-normal"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label className="text-sm font-medium">Deadline *<input required type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#ddd3de] bg-white px-3 font-normal"/></label></div>
  <section className="rounded-xl border border-[#ded1e0] bg-white p-5"><div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-[260px] flex-1 text-sm font-medium">Pursuit workflow *<select value={workflowId} onChange={e=>choose(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#ddd3de] bg-white px-3 font-normal">{workflows.map(w=><option key={w.id} value={w.id}>{w.name}{w.is_default?' — Default':''}</option>)}</select></label><a href="/settings/lead-workflows" className="rounded-lg border px-3 py-2 text-sm font-semibold text-[#69456d]">Manage workflows</a></div><p className="mt-3 text-xs text-[#817681]">This assignment gets its own snapshot. Remove/add steps here without changing the template.</p><div className="mt-4 space-y-2">{steps.map((s,i)=><div key={i} className="rounded-lg border border-[#ece5ed] bg-[#faf8fb] p-3"><div className="flex items-center gap-2"><span className="w-6 text-xs font-semibold text-[#8b818c]">{i+1}</span><input value={s.title} onChange={e=>setSteps(p=>p.map((x,j)=>j===i?{...x,title:e.target.value}:x))} className="h-9 flex-1 rounded-md border bg-white px-2 text-sm"/><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!s.evidenceRequired} onChange={e=>setSteps(p=>p.map((x,j)=>j===i?{...x,evidenceRequired:e.target.checked}:x))}/>Evidence</label><button type="button" onClick={()=>setSteps(p=>p.filter((_,j)=>j!==i))} className="text-xs font-semibold text-red-600">Remove</button></div></div>)}<button type="button" onClick={()=>setSteps(p=>[...p,{title:'New pursuit step',evidenceRequired:false}])} className="text-sm font-semibold text-[#69456d]">+ Add step</button></div></section>
  <section className="rounded-xl border border-[#e6dce7] bg-white p-4"><h3 className="font-semibold">Supporting files</h3><input ref={fileRef} type="file" multiple accept={ACCEPTED_FILES} onChange={e=>addFiles(e.target.files)} className="mt-3 block w-full text-sm"/>{files.map((f,i)=><div key={i} className="mt-2 flex justify-between text-sm"><span>{f.name}</span><button type="button" onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))}>Remove</button></div>)}</section>
  <button disabled={saving||!leads.length} className="w-full rounded-lg bg-[#36133b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving?'Assigning...':`Assign ${leads.length} lead${leads.length===1?'':'s'} with workflow`}</button>
</form></div></div>
}


function AddLeadDrawer({onClose,onSaved}:{onClose:()=>void;onSaved:()=>Promise<void>}){
  const [form,setForm]=useState({organizationName:'',website:'',industry:'',location:'',email:'',phone:'',source:'',priority:'MEDIUM',notes:''});
  const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);
  const set=(k:string,v:string)=>setForm(p=>({...p,[k]:v}));
  async function submit(e:FormEvent){e.preventDefault();try{setSaving(true);setError(null);await apiFetch('/admin/leads/organization',{method:'POST',body:JSON.stringify(form)});await onSaved();}catch(err){setError(err instanceof Error?err.message:'Unable to add lead.');}finally{setSaving(false);}}
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/25"><div className="h-full w-full max-w-xl overflow-y-auto bg-[#fbf9fc] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e8e0e9] bg-white px-6 py-5"><div><h2 className="text-xl font-semibold">Add organization lead</h2><p className="mt-1 text-xs text-[#817681]">No primary contact is required at this stage.</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4eff6]"><X size={19}/></button></div><form onSubmit={submit} className="space-y-5 p-6 pb-20">{error?<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>:null}<Field label="Organization name *" value={form.organizationName} onChange={v=>set('organizationName',v)} required/><div className="grid gap-4 sm:grid-cols-2"><Field label="Website" value={form.website} onChange={v=>set('website',v)}/><Field label="Industry" value={form.industry} onChange={v=>set('industry',v)}/><Field label="General email" value={form.email} onChange={v=>set('email',v)} type="email"/><Field label="Phone" value={form.phone} onChange={v=>set('phone',v)}/></div><Field label="Location" value={form.location} onChange={v=>set('location',v)} placeholder="Lagos, Nigeria"/><div className="grid gap-4 sm:grid-cols-2"><Field label="Source" value={form.source} onChange={v=>set('source',v)} placeholder="Referral, event, research..."/><label className="text-sm font-medium">Priority<select value={form.priority} onChange={e=>set('priority',e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#ddd3de] bg-white px-3 font-normal"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></label></div><label className="block text-sm font-medium">Notes<textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={5} className="mt-2 w-full rounded-lg border border-[#ddd3de] bg-white p-3 font-normal outline-none focus:border-[#765078]" placeholder="What does management already know about this organization?"/></label><div className="rounded-xl border border-[#e5dce6] bg-[#f4eff6] p-4 text-sm leading-6 text-[#665a68]"><strong>Next:</strong> this organization enters the Lead Pool as <strong>Unassigned</strong>. Select it from the table when management is ready to assign pursuit work.</div><button disabled={saving} className="w-full rounded-lg bg-[#36133b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving?'Adding lead...':'Add to Lead Pool'}</button></form></div></div>;
}

function Field({label,value,onChange,required,type='text',placeholder}:{label:string;value:string;onChange:(v:string)=>void;required?:boolean;type?:string;placeholder?:string}){return <label className="block text-sm font-medium">{label}<input type={type} required={required} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 h-11 w-full rounded-lg border border-[#ddd3de] bg-white px-3 font-normal outline-none focus:border-[#765078]"/></label>}
function Card({label,value}:{label:string;value:number}){return <div className="rounded-2xl border border-[#e9e2ea] bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#8b818c]">{label}</p><p className="mt-2 text-3xl font-semibold text-[#36133b]">{value}</p></div>}
function Badge({children}:{children:React.ReactNode}){return <span className="inline-flex rounded-full bg-[#f4eff6] px-2.5 py-1 text-xs font-semibold text-[#69456d]">{children}</span>}
function friendly(v:string){return v.charAt(0)+v.slice(1).toLowerCase().replaceAll('_',' ')}
