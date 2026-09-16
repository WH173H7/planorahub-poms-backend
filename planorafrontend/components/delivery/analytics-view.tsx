'use client';

import Link from 'next/link';
import type {ReactNode} from 'react';
import {useEffect,useMemo,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Skeleton} from '@/components/ui/skeleton';
import {PageErrorState} from '@/components/ui/page-state';
import {staffOpsAnalytics} from '@/lib/workspace/ops-api';

type Section='OVERVIEW'|'CRM'|'WORKFORCE'|'DELIVERY'|'OPERATIONS';
const money=(value:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',notation:Math.abs(value)>=1_000_000?'compact':'standard',maximumFractionDigits:1}).format(Number(value||0));
const human=(value:string)=>String(value||'').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export function AnalyticsView(){
  const[data,setData]=useState<any|null>(null),[error,setError]=useState<string|null>(null),[section,setSection]=useState<Section>('OVERVIEW');
  useEffect(()=>{let alive=true;staffOpsAnalytics().then(x=>alive&&setData(x)).catch(e=>alive&&setError(e instanceof Error?e.message:'Unable to load analytics.'));return()=>{alive=false}},[]);
  if(error)return <AppShell area="admin" title="Analytics" breadcrumb="Insights"><PageErrorState message={error}/></AppShell>;
  if(!data)return <AppShell area="admin" title="Analytics" breadcrumb="Insights"><Skeleton height={560}/></AppShell>;

  const tabs:Array<[Section,string,string]>=[['OVERVIEW','Executive overview','Company pulse'],['CRM','CRM & commercial','Lead to Client'],['WORKFORCE','Workforce','Staff, Teams & Departments'],['DELIVERY','Delivery','Tasks & follow-ups'],['OPERATIONS','Operations','Mail, files & letters']];
  return <AppShell area="admin" title="Analytics" breadcrumb="Insights" description="Company-wide operational intelligence across CRM, commercial performance, workforce and delivery." actions={<Link href="/reports"><Button>Open Reports</Button></Link>}>
    <div className="analytics-pro-page">
      <div className="analytics-pro-tabs">{tabs.map(([id,label,sub])=><button key={id} className={section===id?'is-active':''} onClick={()=>setSection(id)}><strong>{label}</strong><span>{sub}</span></button>)}</div>
      {section==='OVERVIEW'?<Overview data={data}/>:null}
      {section==='CRM'?<Crm data={data}/>:null}
      {section==='WORKFORCE'?<Workforce data={data}/>:null}
      {section==='DELIVERY'?<Delivery data={data}/>:null}
      {section==='OPERATIONS'?<Operations data={data}/>:null}
    </div>
  </AppShell>;
}

function Overview({data}:{data:any}){const c=data.crm,t=data.tasks,w=data.workforce,r=data.revenue;return <div className="analytics-pro-stack">
  <div className="analytics-pro-kpis"><Metric label="Active Leads" value={c.leads} sub={`${c.pool} in Lead Pool`}/><Metric label="Prospects" value={c.prospects} sub={`${c.lead_to_prospect_rate||0}% Lead → Prospect`}/><Metric label="Clients" value={c.clients} sub={`${c.prospect_to_client_rate||0}% Prospect → Client`}/><Metric label="Expected value" value={money(r.expected)} sub="Approved Prospects"/><Metric label="Realized revenue" value={money(r.actual)} sub="Recorded Clients"/><Metric label="Delivery rate" value={`${t.completion_rate||0}%`} sub={`${t.completed} tasks completed`}/></div>
  <div className="analytics-pro-grid two"><Card><Panel title="Six-month operating trend" eyebrow="Momentum"><Trend rows={data.trends}/></Panel></Card><Card><Panel title="Company health" eyebrow="Today"><div className="analytics-health-grid"><Health label="Active staff" value={w.active_staff}/><Health label="Departments" value={w.departments}/><Health label="Teams" value={w.teams}/><Health label="Overdue tasks" value={t.overdue} danger={t.overdue>0}/><Health label="Follow-ups today" value={data.followups.today}/><Health label="Pending letters" value={data.communications.pending_letters} warning={data.communications.pending_letters>0}/></div></Panel></Card></div>
  <Card><Panel title="Highest current contributors" eyebrow="Workforce"><People rows={data.staff.slice(0,8)}/></Panel></Card>
</div>}

function Crm({data}:{data:any}){const c=data.crm;return <div className="analytics-pro-stack">
  <div className="analytics-pro-kpis"><Metric label="Leads" value={c.leads} sub={`${c.assigned} assigned`}/><Metric label="Lead Pool" value={c.pool} sub="Available to staff"/><Metric label="Active pursuit" value={c.active_pursuit} sub="Being worked"/><Metric label="Prospects" value={c.prospects} sub={money(data.revenue.expected)}/><Metric label="Clients" value={c.clients} sub={money(data.revenue.actual)}/></div>
  <div className="analytics-pro-grid two"><Card><Panel title="Lead stage distribution" eyebrow="Pipeline"><Donut rows={data.stages.map((x:any)=>({label:human(x.label),value:Number(x.count)}))}/></Panel></Card><Card><Panel title="Commercial progression" eyebrow="Qualified value"><Donut moneyMode rows={data.commercial.map((x:any)=>({label:human(x.label),value:Number(x.revenue)}))}/></Panel></Card></div>
  <div className="analytics-pro-grid two"><Card><Panel title="Lead sources" eyebrow="Acquisition"><BarRows rows={data.sources}/></Panel></Card><Card><Panel title="Industry mix" eyebrow="Market"><BarRows rows={data.industries}/></Panel></Card></div>
</div>}

function Workforce({data}:{data:any}){return <div className="analytics-pro-stack">
  <div className="analytics-pro-kpis"><Metric label="Active staff" value={data.workforce.active_staff} sub="Current workforce"/><Metric label="Departments" value={data.workforce.departments} sub="Active departments"/><Metric label="Teams" value={data.workforce.teams} sub="Cross-functional teams"/></div>
  <Card><Panel title="Staff performance" eyebrow="People"><People rows={data.staff}/></Panel></Card>
  <div className="analytics-pro-grid two"><Card><Panel title="Department delivery" eyebrow="Structure"><Structure rows={data.departments}/></Panel></Card><Card><Panel title="Team delivery" eyebrow="Collaboration"><Structure rows={data.teams}/></Panel></Card></div>
</div>}

function Delivery({data}:{data:any}){const t=data.tasks,f=data.followups;return <div className="analytics-pro-stack">
  <div className="analytics-pro-kpis"><Metric label="Tasks" value={t.total} sub={`${t.active} active`}/><Metric label="Completed" value={t.completed} sub={`${t.completion_rate||0}% completion`}/><Metric label="Overdue" value={t.overdue} sub="Needs attention"/><Metric label="Scheduled" value={t.scheduled} sub="Dispatch later"/><Metric label="Paused" value={t.paused} sub="Temporarily stopped"/><Metric label="Follow-ups" value={f.total} sub={`${f.completed} completed`}/></div>
  <div className="analytics-pro-grid two"><Card><Panel title="Task status mix" eyebrow="Execution"><Donut rows={data.taskStatuses.map((x:any)=>({label:human(x.label),value:Number(x.count)}))}/></Panel></Card><Card><Panel title="Task priority" eyebrow="Workload"><BarRows rows={data.taskPriorities}/></Panel></Card></div>
  <Card><Panel title="Follow-up health" eyebrow="Engagement"><div className="analytics-health-grid"><Health label="Overdue" value={f.overdue} danger={f.overdue>0}/><Health label="Due today" value={f.today}/><Health label="Upcoming" value={f.upcoming}/><Health label="Completed" value={f.completed}/></div></Panel></Card>
</div>}

function Operations({data}:{data:any}){const c=data.communications;return <div className="analytics-pro-stack">
  <div className="analytics-pro-kpis"><Metric label="Outbound mail" value={c.outbound_mail} sub="CRM messages sent"/><Metric label="Inbound mail" value={c.inbound_mail} sub="Replies received"/><Metric label="Official letters" value={c.letters} sub={`${c.pending_letters} awaiting approval`}/><Metric label="Approved letters" value={c.approved_letters} sub="Ready to issue"/><Metric label="Shared files" value={c.shared_files} sub={`${c.shared_folders} folders`}/></div>
  <div className="analytics-pro-grid two"><Card><Panel title="Communication footprint" eyebrow="Mail & correspondence"><div className="analytics-health-grid"><Health label="Outbound emails" value={c.outbound_mail}/><Health label="Inbound replies" value={c.inbound_mail}/><Health label="Letters approved" value={c.approved_letters}/><Health label="Letters pending" value={c.pending_letters} warning={c.pending_letters>0}/></div></Panel></Card><Card><Panel title="Knowledge workspace" eyebrow="Shared files"><div className="analytics-health-grid"><Health label="Folders" value={c.shared_folders}/><Health label="Files" value={c.shared_files}/></div><p className="ui-help analytics-note">Shared Files activity represents the current company workspace. Detailed audit history remains available under Audit Logs.</p></Panel></Card></div>
</div>}

function Metric({label,value,sub}:{label:string;value:string|number;sub:string}){return <Card><div className="analytics-pro-metric"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></Card>}
function Panel({eyebrow,title,children}:{eyebrow:string;title:string;children:ReactNode}){return <div className="analytics-pro-panel"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{children}</div>}
function Health({label,value,danger=false,warning=false}:{label:string;value:string|number;danger?:boolean;warning?:boolean}){return <div className={`analytics-health ${danger?'is-danger':warning?'is-warning':''}`}><span>{label}</span><strong>{value}</strong></div>}
function Donut({rows,moneyMode=false}:{rows:Array<{label:string;value:number}>;moneyMode?:boolean}){const total=rows.reduce((s,x)=>s+x.value,0),colors=['#541961','#793087','#9d5ca8','#c79acf','#e4cee8','#6b596e'];let acc=0;const stops=rows.map((r,i)=>{const start=total?acc/total*100:0;acc+=r.value;return `${colors[i%colors.length]} ${start}% ${total?acc/total*100:0}%`}).join(',');return <div className="analytics-donut-layout"><div className="analytics-donut" style={{background:`conic-gradient(${stops||'#eee 0 100%'})`}}><div className="analytics-donut-center"><strong>{moneyMode?money(total):total}</strong><small>Total</small></div></div><div className="analytics-legend">{rows.slice(0,9).map((r,i)=><div key={r.label}><i style={{background:colors[i%colors.length]}}/><span>{r.label}</span><strong>{moneyMode?money(r.value):r.value}</strong></div>)}</div></div>}
function BarRows({rows}:{rows:Array<any>}){const max=Math.max(1,...rows.map(r=>Number(r.count||0)));return <div className="analytics-bars">{rows.map(r=><div className="analytics-bar-row" key={r.label}><div><strong>{human(r.label)}</strong><small>{r.count} records</small></div><div className="analytics-bar-track"><span style={{width:`${Math.max(4,Number(r.count||0)/max*100)}%`}}/></div><strong>{r.count}</strong></div>)}</div>}
function People({rows}:{rows:Array<any>}){return <div className="analytics-people-table"><div className="analytics-people-head"><span>Staff</span><span>CRM</span><span>Delivery</span><span>Commercial</span></div>{rows.map(r=><div className="analytics-people-row" key={r.id}><div><strong>{r.first_name} {r.last_name}</strong><small>{r.role_name||'Staff'} · {r.department_name||'No department'}</small></div><span>{r.leads||0} leads · {r.prospects||0} prospects · {r.clients||0} clients</span><span>{r.completed_tasks||0} completed · {r.overdue_tasks||0} overdue</span><span>{money(Number(r.actual_revenue||0))} realized<br/><small>{money(Number(r.expected_revenue||0))} expected</small></span></div>)}</div>}
function Structure({rows}:{rows:Array<any>}){return <div className="analytics-structure-list">{rows.map(r=><div key={r.id}><div><strong>{r.name}</strong><small>{r.staff_count??r.member_count??0} people</small></div><span>{r.leads||0} leads</span><span>{r.completed_tasks||0} completed</span><span className={Number(r.overdue_tasks||0)>0?'is-risk':''}>{r.overdue_tasks||0} overdue</span></div>)}</div>}
function Trend({rows}:{rows:Array<any>}){const max=Math.max(1,...rows.flatMap(r=>[Number(r.leads||0),Number(r.prospects||0),Number(r.clients||0),Number(r.completed_tasks||0)]));return <div className="analytics-trend"><div className="analytics-trend-legend"><span><i className="lead"/>Leads</span><span><i className="prospect"/>Prospects</span><span><i className="client"/>Clients</span><span><i className="task"/>Completed tasks</span></div><div className="analytics-trend-chart">{rows.map(r=><div className="analytics-trend-month" key={r.label}><div className="analytics-trend-bars"><i className="lead" style={{height:`${Math.max(3,Number(r.leads||0)/max*100)}%`}}/><i className="prospect" style={{height:`${Math.max(3,Number(r.prospects||0)/max*100)}%`}}/><i className="client" style={{height:`${Math.max(3,Number(r.clients||0)/max*100)}%`}}/><i className="task" style={{height:`${Math.max(3,Number(r.completed_tasks||0)/max*100)}%`}}/></div><span>{r.label}</span></div>)}</div></div>}
