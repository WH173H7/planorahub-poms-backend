'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import { getLatestActivities, type LatestActivityItem } from '@/lib/delivery/api';

const fmt = (value: string) => new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
const actor = (row: LatestActivityItem) => [row.actor_first_name,row.actor_last_name].filter(Boolean).join(' ') || row.actor_email || 'System';
const human = (value: string) => value.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,(c)=>c.toUpperCase());

type Area='ALL'|'LEAD'|'PROSPECT'|'TASK'|'CLIENT';

export function LatestActivitiesView(){
  const [rows,setRows]=useState<LatestActivityItem[]|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [area,setArea]=useState<Area>('ALL');
  const [query,setQuery]=useState('');
  const [person,setPerson]=useState('ALL');
  const [period,setPeriod]=useState('30');
  useEffect(()=>{getLatestActivities().then(setRows).catch((e)=>setError(e instanceof Error?e.message:'Unable to load latest activities.'))},[]);
  const actors=useMemo(()=>{const m=new Map<string,string>();(rows??[]).forEach(r=>{if(r.actor_user_id)m.set(r.actor_user_id,actor(r))});return [...m.entries()].sort((a,b)=>a[1].localeCompare(b[1]))},[rows]);
  const visible=useMemo(()=>{const cutoff=period==='ALL'||period==='TODAY'?0:Date.now()-Number(period)*86400000;return(rows??[]).filter(r=>{
    if(area==='TASK'&&r.entity_type!=='task')return false;
    if(area!=='ALL'&&area!=='TASK'&&r.record_type!==area)return false;
    if(person!=='ALL'&&r.actor_user_id!==person)return false;
    if(period==='TODAY'&&new Date(r.created_at).toDateString()!==new Date().toDateString())return false;
    if(cutoff&&new Date(r.created_at).getTime()<cutoff)return false;
    if(query.trim()&&!`${r.action} ${r.module} ${r.entity_title??''} ${actor(r)}`.toLowerCase().includes(query.toLowerCase()))return false;
    return true;
  })},[rows,area,query,person,period]);
  const today=(rows??[]).filter(r=>new Date(r.created_at).toDateString()===new Date().toDateString()).length;
  const counts={LEAD:(rows??[]).filter(r=>r.record_type==='LEAD').length,PROSPECT:(rows??[]).filter(r=>r.record_type==='PROSPECT').length,TASK:(rows??[]).filter(r=>r.entity_type==='task').length,CLIENT:(rows??[]).filter(r=>r.record_type==='CLIENT').length};
  if(error)return <AppShell area="admin" title="Latest Activities" breadcrumb="People"><PageErrorState message={error}/></AppShell>;
  if(!rows)return <AppShell area="admin" title="Latest Activities" breadcrumb="People"><PageLoadingState/></AppShell>;
  return <AppShell area="admin" title="Latest Activities" breadcrumb="People" description="A live operational timeline of meaningful Lead, Prospect, Task and Client actions across the company.">
    <div className="page-stack latest-activity-page">
      <div className="latest-activity-kpis">
        <ActivityKpi label="Today" value={today} active={period==='TODAY'} onClick={()=>{setArea('ALL');setPeriod('TODAY')}}/>
        <ActivityKpi label="Lead events" value={counts.LEAD} active={area==='LEAD'&&period!=='TODAY'} onClick={()=>{setArea('LEAD');setPeriod('ALL')}}/>
        <ActivityKpi label="Prospect events" value={counts.PROSPECT} active={area==='PROSPECT'&&period!=='TODAY'} onClick={()=>{setArea('PROSPECT');setPeriod('ALL')}}/>
        <ActivityKpi label="Task events" value={counts.TASK} active={area==='TASK'&&period!=='TODAY'} onClick={()=>{setArea('TASK');setPeriod('ALL')}}/>
        <ActivityKpi label="Client events" value={counts.CLIENT} active={area==='CLIENT'&&period!=='TODAY'} onClick={()=>{setArea('CLIENT');setPeriod('ALL')}}/>
      </div>
      <Card className="latest-activity-controls"><div className="ui-card-content latest-activity-filter-grid">
        <Input placeholder="Search activity, company or staff…" value={query} onChange={e=>setQuery(e.target.value)}/>
        <NativeSelect value={person} onChange={e=>setPerson(e.target.value)}><option value="ALL">All staff</option>{actors.map(([id,name])=><option key={id} value={id}>{name}</option>)}</NativeSelect>
        <NativeSelect value={period} onChange={e=>setPeriod(e.target.value)}><option value="TODAY">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="ALL">All recent activity</option></NativeSelect>
      </div></Card>
      <Card className="latest-activity-feed-card">
        <header className="latest-activity-feed-head"><div><span className="eyebrow">Operational timeline</span><h2>{visible.length} events</h2><p>Click an activity to open its related record when available.</p></div><Badge tone="purple">Live history</Badge></header>
        <div className="latest-activity-feed">{visible.length?visible.map(row=><ActivityRow key={row.id} row={row}/>):<div className="latest-activity-empty"><strong>No matching activity</strong><p>Try a different module, staff member or date range.</p></div>}</div>
      </Card>
    </div>
  </AppShell>
}

function ActivityKpi({label,value,active,onClick}:{label:string;value:number;active:boolean;onClick:()=>void}){return <button className={`latest-activity-kpi${active?' is-active':''}`} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>}
function ActivityRow({row}:{row:LatestActivityItem}){
  const type=row.entity_type==='task'?'TASK':row.record_type||'LEAD';
  const tone=type==='CLIENT'?'success':type==='PROSPECT'?'purple':type==='TASK'?'warning':'neutral';
  const content=<><span className={`latest-activity-dot type-${type.toLowerCase()}`}/><div className="latest-activity-copy"><div className="latest-activity-title-row"><strong>{human(row.action)}</strong><Badge tone={tone as any}>{type}</Badge></div><p>{row.entity_title||human(row.entity_type||row.module)}{row.lead_stage?` · ${human(row.lead_stage)}`:''}</p><small>{actor(row)}{row.actor_role_name?` · ${row.actor_role_name}`:''} · {fmt(row.created_at)}</small></div><span className="latest-activity-open">{row.href?'Open →':''}</span></>;
  return row.href?<Link href={row.href} className="latest-activity-row">{content}</Link>:<div className="latest-activity-row">{content}</div>
}
