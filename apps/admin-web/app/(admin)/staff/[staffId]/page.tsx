'use client';

import { ArrowLeft, Ban, CheckCircle2, Copy, KeyRound, Pencil, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Permission={id:string;code:string;name:string;module:string;description?:string|null};
type Role={id:string;code:string;name:string;department_ids?:string[];permissions?:Permission[]};
type Department={id:string;name:string};
type Team={id:string;name:string;department_id:string;department_name?:string};
type AuditEvent={id:string;actor_user_id:string|null;entity_id:string|null;action:string;new_values:Record<string,unknown>|null;created_at:string;actor_first_name:string|null;actor_last_name:string|null;actor_email:string|null;target_first_name:string|null;target_last_name:string|null;target_email:string|null};
type Staff={
  id:string;first_name:string;last_name:string;email:string;phone:string|null;job_title:string|null;
  status:'INVITED'|'ACTIVE'|'SUSPENDED'|'DISABLED';must_change_password:boolean;last_login_at:string|null;created_at:string;
  role_id:string;role_code:string;role_name:string;department_id:string|null;department_name:string|null;
  teams:Team[];permission_overrides:Array<Permission&{permission_id:string;effect:'ALLOW'|'DENY'}>;role_permissions:Permission[];audit_events:AuditEvent[];
};
type Resp<T>={success:boolean;data:T;message?:string};

export default function StaffDetailPage(){
  const {staffId}=useParams<{staffId:string}>(); const router=useRouter();
  const [staff,setStaff]=useState<Staff|null>(null); const [roles,setRoles]=useState<Role[]>([]);
  const [departments,setDepartments]=useState<Department[]>([]); const [teams,setTeams]=useState<Team[]>([]);
  const [permissions,setPermissions]=useState<Permission[]>([]); const [tab,setTab]=useState<'overview'|'access'|'activity'>('overview');
  const [editing,setEditing]=useState(false); const [error,setError]=useState<string|null>(null);
  const [temp,setTemp]=useState<string|null>(null); const [busy,setBusy]=useState<string|null>(null);

  async function load(){
    try{
      setError(null);
      const [s,r,d,t,p]=await Promise.all([
        apiFetch<Resp<Staff>>(`/admin/staff/${staffId}`),
        apiFetch<Resp<Role[]>>('/admin/roles'),
        apiFetch<Resp<Department[]>>('/admin/departments'),
        apiFetch<Resp<Team[]>>('/admin/teams'),
        apiFetch<Resp<Permission[]>>('/admin/permissions'),
      ]);
      setStaff(s.data);setRoles(r.data);setDepartments(d.data);setTeams(t.data);setPermissions(p.data);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load staff profile.');}
  }
  useEffect(()=>{void load();},[staffId]);

  async function act(action:'suspend'|'disable'|'reactivate'){
    if(!staff||!confirm(`Are you sure you want to ${action} ${staff.first_name} ${staff.last_name}?`))return;
    try{setBusy(action);await apiFetch(`/admin/staff/${staff.id}/${action}`,{method:'POST'});await load();}
    catch(e){setError(e instanceof Error?e.message:'Account action failed.');}finally{setBusy(null);}
  }
  async function reset(){
    if(!staff||!confirm(`Generate a new temporary password for ${staff.first_name}?`))return;
    try{setBusy('reset');const r=await apiFetch<Resp<{temporaryPassword:string}>>(`/admin/staff/${staff.id}/reset-password`,{method:'POST'});setTemp(r.data.temporaryPassword);await load();}
    catch(e){setError(e instanceof Error?e.message:'Password reset failed.');}finally{setBusy(null);}
  }

  if(!staff)return <div className="mx-auto max-w-[1450px] p-6 text-sm text-[#817681]">{error??'Loading staff profile...'}</div>;

  return <div className="mx-auto max-w-[1450px]">
    <button onClick={()=>router.push('/staff')} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#6f6170] hover:text-[#36133b]"><ArrowLeft size={16}/>Staff Management</button>
    {error?<div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>:null}

    <motion.section initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="overflow-hidden rounded-2xl border border-[#e8e0e9] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="flex gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4eff6] text-xl font-bold text-[#36133b]">{staff.first_name[0]}{staff.last_name[0]}</div>
          <div>
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">{staff.first_name} {staff.last_name}</h1><Status status={staff.status}/></div>
            <p className="mt-2 text-sm text-[#726874]">{staff.job_title??'No job title'} · {staff.department_name??'No department'} · {staff.role_name}</p>
            <p className="mt-1 text-sm text-[#918693]">{staff.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#ded4e0] px-3.5 py-2.5 text-sm font-semibold"><Pencil size={16}/>Edit</button>
          <button onClick={reset} disabled={busy==='reset'} className="inline-flex items-center gap-2 rounded-lg border border-[#ded4e0] px-3.5 py-2.5 text-sm font-semibold disabled:opacity-50"><KeyRound size={16}/>Reset password</button>
        </div>
      </div>
      <div className="flex gap-1 border-t border-[#eee8ef] px-5 pt-2">
        {(['overview','access','activity'] as const).map(x=><button key={x} onClick={()=>setTab(x)} className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize ${tab===x?'border-[#36133b] text-[#36133b]':'border-transparent text-[#817681]'}`}>{x}</button>)}
      </div>
    </motion.section>

    {tab==='overview'?<div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
        <h2 className="text-lg font-semibold">Staff information</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Info l="Email" v={staff.email}/><Info l="Phone" v={staff.phone??'Not added'}/><Info l="Job title" v={staff.job_title??'Not added'}/>
          <Info l="Department" v={staff.department_name??'Not assigned'}/><Info l="Role" v={staff.role_name}/><Info l="Teams" v={staff.teams.length?staff.teams.map(x=>x.name).join(', '):'No teams'}/>
          <Info l="Created" v={fmt(staff.created_at)}/><Info l="Last login" v={staff.last_login_at?fmt(staff.last_login_at):'Never'}/>
        </div>
      </section>
      <aside className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between rounded-lg bg-[#faf7fb] p-3"><span>Status</span><b>{staff.status}</b></div><div className="flex justify-between rounded-lg bg-[#faf7fb] p-3"><span>Password setup</span><b>{staff.must_change_password?'Change required':'Complete'}</b></div></div>
        <div className="mt-6 border-t border-[#eee8ef] pt-5">
          {staff.status==='SUSPENDED'||staff.status==='DISABLED'
            ?<button onClick={()=>act('reactivate')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white"><CheckCircle2 size={16}/>Reactivate</button>
            :<div className="grid gap-2"><button onClick={()=>act('suspend')} className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800"><Ban size={16}/>Suspend</button><button onClick={()=>act('disable')} className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700"><XCircle size={16}/>Disable</button></div>}
        </div>
      </aside>
    </div>:null}

    {tab==='access'?<Access staff={staff} permissions={permissions}/>:null}
    {tab==='activity'?<ActivityTab staffId={staff.id} events={staff.audit_events}/>:null}
    {editing?<EditDrawer staff={staff} roles={roles} departments={departments} teams={teams} permissions={permissions} close={()=>setEditing(false)} saved={async()=>{await load();setEditing(false);}}/>:null}
    {temp?<Temp password={temp} close={()=>setTemp(null)}/>:null}
  </div>;
}

function Access({staff,permissions}:{staff:Staff;permissions:Permission[]}){
  const allowed=useMemo(()=>new Set(staff.role_permissions.map(x=>x.id)),[staff.role_permissions]);
  const overrides=useMemo(()=>new Map(staff.permission_overrides.map(x=>[x.permission_id,x.effect])),[staff.permission_overrides]);
  const modules=new Set(staff.role_permissions.map(x=>x.module)); const visible=permissions.filter(x=>modules.has(x.module));
  return <section className="mt-6 rounded-2xl border border-[#e9e2ea] bg-white p-6"><h2 className="text-lg font-semibold">Access configuration</h2><p className="mt-1 text-sm text-[#817681]">Role defaults plus individual overrides.</p><div className="mt-6 space-y-2">{visible.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eee8ef] px-4 py-3"><div><p className="text-sm font-semibold">{p.name}</p><p className="mt-1 text-xs text-[#817681]">{p.module}</p></div><div className="flex gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${allowed.has(p.id)?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>Role default: {allowed.has(p.id)?'Allowed':'Denied'}</span>{overrides.get(p.id)?<span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">Override: {overrides.get(p.id)}</span>:null}</div></div>)}</div></section>;
}

function ActivityTab({staffId,events}:{staffId:string;events:AuditEvent[]}){
  return <section className="mt-6 rounded-2xl border border-[#e9e2ea] bg-white p-6">
    <h2 className="text-lg font-semibold">Staff activity</h2>
    <p className="mt-1 text-sm text-[#817681]">Account history and actions performed by this staff member.</p>

    <div className="mt-7">
      {events.length?events.map((e,i)=>{
        const performedByStaff=e.actor_user_id===staffId&&e.entity_id!==staffId;

        const context=performedByStaff
          ? e.target_first_name
            ? `Performed on ${`${e.target_first_name} ${e.target_last_name??''}`.trim()}`
            : 'Action performed'
          : e.actor_first_name
            ? `Performed by ${`${e.actor_first_name} ${e.actor_last_name??''}`.trim()}`
            : e.actor_email
              ? `Performed by ${e.actor_email}`
              : 'System';

        return <div key={e.id} className="relative flex gap-4 pb-7">
          {i<events.length-1?<div className="absolute left-[9px] top-5 h-full border-l border-dashed border-[#d9cddd]"/>:null}

          <div className="relative z-[1] mt-1 h-[19px] w-[19px] shrink-0 rounded-full border-4 border-[#f4eff6] bg-[#765078]"/>

          <div>
            <p className="text-sm font-semibold">{friendly(e.action)}</p>
            <p className="mt-1 text-xs text-[#817681]">{context} · {fmt(e.created_at)}</p>
          </div>
        </div>;
      }):<p className="text-sm text-[#817681]">No activity recorded yet.</p>}
    </div>
  </section>;
}

function EditDrawer({staff,roles,departments,teams,permissions,close,saved}:{staff:Staff;roles:Role[];departments:Department[];teams:Team[];permissions:Permission[];close:()=>void;saved:()=>Promise<void>}){
  const [firstName,setFirstName]=useState(staff.first_name),[lastName,setLastName]=useState(staff.last_name),[email,setEmail]=useState(staff.email),[phone,setPhone]=useState(staff.phone??''),[jobTitle,setJobTitle]=useState(staff.job_title??'');
  const [departmentId,setDepartmentId]=useState(staff.department_id??''),[roleId,setRoleId]=useState(staff.role_id),[teamIds,setTeamIds]=useState(staff.teams.map(x=>x.id));
  const [overrides,setOverrides]=useState<Record<string,'DEFAULT'|'ALLOW'|'DENY'>>(Object.fromEntries(staff.permission_overrides.map(x=>[x.permission_id,x.effect])));
  const [error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false);
  const availableRoles=departmentId?roles.filter(r=>!r.department_ids?.length||r.department_ids.includes(departmentId)):roles.filter(r=>!r.department_ids?.length);
  const availableTeams=departmentId?teams.filter(t=>t.department_id===departmentId):[];
  const selected=roles.find(r=>r.id===roleId); const rolePerms=selected?.permissions??[]; const ids=new Set(rolePerms.map(x=>x.id)); const mods=new Set(rolePerms.map(x=>x.module)); const visible=permissions.filter(x=>mods.has(x.module));
  async function submit(e:FormEvent){e.preventDefault();try{setSaving(true);setError(null);await apiFetch(`/admin/staff/${staff.id}`,{method:'PATCH',body:JSON.stringify({firstName:firstName.trim(),lastName:lastName.trim(),email:email.trim().toLowerCase(),phone:phone.trim()||null,jobTitle:jobTitle.trim()||null,departmentId:departmentId||null,roleId,teamIds,permissionOverrides:Object.entries(overrides).filter(([,v])=>v!=='DEFAULT').map(([permissionId,effect])=>({permissionId,effect}))})});await saved();}catch(e){setError(e instanceof Error?e.message:'Unable to save changes.');}finally{setSaving(false);}}
  return <div className="fixed inset-0 z-[120]"><button aria-label="Close" onClick={close} className="absolute inset-0 bg-black/25"/><motion.div initial={{x:30,opacity:0}} animate={{x:0,opacity:1}} className="absolute inset-y-0 right-0 w-full max-w-[650px] overflow-y-auto bg-white shadow-2xl"><form onSubmit={submit} className="space-y-7 p-6"><h2 className="text-xl font-semibold">Edit staff</h2>{error?<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>:null}<div className="grid gap-4 sm:grid-cols-2"><Field l="First name" v={firstName} s={setFirstName}/><Field l="Last name" v={lastName} s={setLastName}/><Field l="Email" v={email} s={setEmail}/><Field l="Phone" v={phone} s={setPhone}/><Field l="Job title" v={jobTitle} s={setJobTitle}/></div>
    <Select l="Department" v={departmentId} s={v=>{setDepartmentId(v);setRoleId('');setTeamIds([]);setOverrides({});}} o={departments.map(x=>({value:x.id,label:x.name}))}/><Select l="Role" v={roleId} s={v=>{setRoleId(v);setOverrides({});}} o={availableRoles.map(x=>({value:x.id,label:x.name}))}/>
    <div><p className="text-sm font-semibold">Teams</p><div className="mt-2 space-y-2">{availableTeams.map(t=><label key={t.id} className="flex gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={teamIds.includes(t.id)} onChange={e=>setTeamIds(c=>e.target.checked?[...c,t.id]:c.filter(x=>x!==t.id))}/>{t.name}</label>)}</div></div>
    <div><p className="text-sm font-semibold">Permission overrides</p><div className="mt-3 space-y-2">{visible.map(p=><div key={p.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-semibold">{p.name}</p><p className="text-xs text-[#817681]">Role default: {ids.has(p.id)?'Allowed':'Denied'}</p></div><select value={overrides[p.id]??'DEFAULT'} onChange={e=>setOverrides(c=>({...c,[p.id]:e.target.value as any}))} className="h-9 w-[116px] rounded-lg border px-3 text-xs font-semibold"><option value="DEFAULT">Default</option><option value="ALLOW">Allow</option><option value="DENY">Deny</option></select></div>)}</div></div>
    <div className="flex gap-3"><button type="button" onClick={close} className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="flex-1 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white">{saving?'Saving...':'Save changes'}</button></div>
  </form></motion.div></div>;
}

function Temp({password,close}:{password:string;close:()=>void}){const [copied,setCopied]=useState(false);return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h2 className="text-xl font-semibold">Temporary password</h2><div className="mt-4 rounded-xl bg-[#f4eff6] p-4"><code className="break-all font-semibold text-[#36133b]">{password}</code><button onClick={async()=>{await navigator.clipboard.writeText(password);setCopied(true);}} className="mt-4 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><Copy size={15}/>{copied?'Copied':'Copy'}</button></div><button onClick={close} className="mt-5 w-full rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white">Done</button></div></div>}
function Info({l,v}:{l:string;v:string}){return <div><p className="text-xs font-semibold uppercase tracking-wide text-[#918693]">{l}</p><p className="mt-1 text-sm font-medium">{v}</p></div>}
function Status({status}:{status:Staff['status']}){const c={ACTIVE:'bg-emerald-50 text-emerald-700',INVITED:'bg-amber-50 text-amber-700',SUSPENDED:'bg-orange-50 text-orange-700',DISABLED:'bg-slate-100 text-slate-600'};return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c[status]}`}>{status}</span>}
function Field({l,v,s}:{l:string;v:string;s:(x:string)=>void}){return <label className="block"><span className="text-sm font-semibold">{l}</span><input value={v} onChange={e=>s(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[#e3dae4] px-3 text-sm outline-none focus:border-[#765078]"/></label>}
function Select({l,v,s,o}:{l:string;v:string;s:(x:string)=>void;o:{value:string;label:string}[]}){return <label className="block"><span className="text-sm font-semibold">{l}</span><select value={v} onChange={e=>s(e.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="">Select</option>{o.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>}
function friendly(x:string){return x.toLowerCase().split('_').map(s=>s[0]?.toUpperCase()+s.slice(1)).join(' ')}
function fmt(x:string){return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(x))}
