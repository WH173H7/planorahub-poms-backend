'use client';
import {useEffect,useMemo,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Badge} from '@/components/ui/badge';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {getAuditFeed,type AuditItem} from '@/lib/delivery/api';

const fmt=(x:string)=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(x));
const human=(x:string)=>x.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const actorName=(x:AuditItem)=>[x.actor_first_name,x.actor_last_name].filter(Boolean).join(' ')||x.actor_email||'System';

export function AuditView(){
  const[rows,setRows]=useState<AuditItem[]>([]),[q,setQ]=useState(''),[actor,setActor]=useState('ALL');
  useEffect(()=>{let a=true;getAuditFeed().then(x=>a&&setRows(x));return()=>{a=false}},[]);
  const actors=useMemo(()=>{
    const map=new Map<string,string>();
    rows.forEach(x=>{if(x.actor_user_id)map.set(x.actor_user_id,actorName(x))});
    return [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  },[rows]);
  const visible=useMemo(()=>rows.filter(x=>{
    if(actor!=='ALL'&&x.actor_user_id!==actor)return false;
    return !q.trim()||[x.action,x.module,x.entity_type,x.actor_first_name,x.actor_last_name,x.actor_email,x.actor_role_name,x.actor_department_name,x.ip_address].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase());
  }),[rows,q,actor]);
  return <AppShell area="admin" title="Audit Logs" breadcrumb="Insights" description="App-wide security, account and meaningful CRM action history across Admin and Staff.">
    <div className="page-stack">
      <Card><div className="ui-card-content" style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 280px',gap:12,alignItems:'end'}}>
        <Input label="Search logs" placeholder="Action, staff, module, email or IP…" value={q} onChange={e=>setQ(e.target.value)}/>
        <NativeSelect label="Staff / actor" value={actor} onChange={e=>setActor(e.target.value)}>
          <option value="ALL">All actors</option>
          {actors.map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </NativeSelect>
      </div></Card>
      <Card><div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:12}}>Showing {visible.length} of {rows.length} recent audit events. Staff task, Lead, Contact, pursuit, chat, reminder and authenticated-session actions appear here when performed.</div><div style={{overflowX:'auto'}}><table className="ui-table"><thead><tr><th>Time</th><th>Actor</th><th>Role / department</th><th>Action</th><th>Module</th><th>Entity</th><th>IP</th></tr></thead><tbody>{visible.map(x=><tr key={x.id}><td>{fmt(x.created_at)}</td><td><strong>{actorName(x)}</strong>{x.actor_email?<div className="ui-help">{x.actor_email}</div>:null}</td><td>{x.actor_role_name||'—'}{x.actor_department_name?<div className="ui-help">{x.actor_department_name}</div>:null}</td><td>{human(x.action)}</td><td><Badge tone="neutral">{x.module}</Badge></td><td>{x.entity_type}{x.entity_id?<div className="ui-help">{x.entity_id.slice(0,8)}…</div>:null}</td><td>{x.ip_address||'—'}</td></tr>)}</tbody></table></div></Card>
    </div>
  </AppShell>;
}
