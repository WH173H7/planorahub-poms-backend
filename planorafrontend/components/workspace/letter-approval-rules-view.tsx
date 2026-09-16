'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {listLetterApprovalExemptions,listLetterApprovalScopes,setLetterApprovalExemption,type LetterApprovalScope} from '@/lib/workspace/api';

type SubjectType='STAFF'|'ROLE'|'DEPARTMENT'|'TEAM'|'LEAD';
const tabs:SubjectType[]=['STAFF','ROLE','DEPARTMENT','TEAM','LEAD'];

export function LetterApprovalRulesView(){
  const [scopes,setScopes]=useState<{staff:LetterApprovalScope[];roles:LetterApprovalScope[];departments:LetterApprovalScope[];teams:LetterApprovalScope[];leads:LetterApprovalScope[]}>({staff:[],roles:[],departments:[],teams:[],leads:[]});
  const [exemptions,setExemptions]=useState<Array<{id:string;subject_type:SubjectType;subject_id:string}>>([]);
  const [tab,setTab]=useState<SubjectType>('STAFF');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState<string|null>(null);
  async function load(){const [s,e]=await Promise.all([listLetterApprovalScopes(),listLetterApprovalExemptions()]);setScopes(s);setExemptions(e as any)}
  useEffect(()=>{void load()},[]);
  const rows=useMemo(()=>{const source=tab==='STAFF'?scopes.staff:tab==='ROLE'?scopes.roles:tab==='DEPARTMENT'?scopes.departments:tab==='TEAM'?scopes.teams:scopes.leads;const q=search.trim().toLowerCase();return source.filter(x=>!q||label(x).toLowerCase().includes(q))},[tab,scopes,search]);
  const isBypassed=(id:string)=>exemptions.some(x=>x.subject_type===tab&&x.subject_id===id);
  async function toggle(id:string){const next=!isBypassed(id);setBusy(id);try{await setLetterApprovalExemption(tab,id,next);await load()}finally{setBusy(null)}}
  return <AppShell area="admin" title="Official Letter Approval Rules" breadcrumb="Communication / Official Letters" description="Approval is required by default. Choose only the people or work contexts that can issue official letters without final Admin review." actions={<><Link href="/letterhead/approvals"><Button variant="outline">Approval inbox</Button></Link><Link href="/letterhead"><Button variant="outline">Official Letters</Button></Link></>}>
    <div className="letter-rules-page">
      <Card className="workspace-card letter-rules-banner"><div><span className="eyebrow">Default policy</span><h2>Admin approval required</h2><p>Every official letter needs final approval unless a matching bypass rule below applies. Lead rules only apply when the letter is linked to that Lead or Prospect.</p></div><Badge tone="success">Protected by default</Badge></Card>
      <Card className="workspace-card letter-rules-workspace"><div className="letter-rules-tabs">{tabs.map(x=><button key={x} type="button" className={tab===x?'is-active':''} onClick={()=>{setTab(x);setSearch('')}}>{x==='STAFF'?'Staff':x==='ROLE'?'Roles':x==='DEPARTMENT'?'Departments':x==='TEAM'?'Teams':'Lead-related'}</button>)}</div><div className="letter-rules-toolbar"><input type="search" placeholder={`Search ${tab.toLowerCase()}…`} value={search} onChange={e=>setSearch(e.target.value)}/><span>{rows.length} available</span></div><div className="letter-rules-list">{rows.map(item=>{const bypass=isBypassed(item.id);return <article key={item.id}><div><strong>{label(item)}</strong><span>{detail(item,tab)}</span></div><div className="letter-rule-state"><Badge tone={bypass?'success':'warning'}>{bypass?'No approval needed':'Approval required'}</Badge><Button size="sm" variant={bypass?'outline':'primary'} loading={busy===item.id} onClick={()=>void toggle(item.id)}>{bypass?'Require approval':'Allow without approval'}</Button></div></article>})}{!rows.length?<p className="ui-help">No matching records.</p>:null}</div></Card>
    </div>
  </AppShell>
}

function label(x:LetterApprovalScope){return x.title||x.name||[x.first_name,x.last_name].filter(Boolean).join(' ')||x.code||'Record'}
function detail(x:LetterApprovalScope,type:SubjectType){if(type==='STAFF')return [x.job_title,x.email,x.status].filter(Boolean).join(' · ');if(type==='ROLE')return `${x.code||'Role'}${x.is_active===false?' · Archived':''}`;if(type==='LEAD')return `${x.record_type||'LEAD'} · ${x.stage||''}`;return x.is_active===false?'Inactive':'Active'}
