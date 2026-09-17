'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import { claimLeadFromPool, listAvailableLeadPool } from '@/lib/leads/api';
import type { Lead } from '@/lib/leads/types';
import { LeadPriorityPill } from './lead-status';

export function StaffLeadPoolView() {
  const router = useRouter();
  const [rows,setRows]=useState<Lead[]>([]);
  const [search,setSearch]=useState('');
  const [claiming,setClaiming]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);

  async function load(){setLoading(true);setError(null);try{setRows(await listAvailableLeadPool());}catch(caught){setError(caught instanceof Error?caught.message:'Unable to load the Lead Pool.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter((lead)=>!q||[lead.organization_name,lead.industry,lead.source,lead.organization_website].filter(Boolean).join(' ').toLowerCase().includes(q));},[rows,search]);

  async function claim(id:string){
    setClaiming(id);setError(null);
    try{await claimLeadFromPool(id);router.push(`/my-work/leads/${id}`);}
    catch(caught){setError(caught instanceof Error?caught.message:'This Lead is no longer available.');await load();}
    finally{setClaiming(null);}
  }

  return <AppShell area="staff" title="Lead Pool" breadcrumb="My Work" description="Pick an available organization Lead when you have capacity. Once you claim it, ownership is immediately locked to you.">
    <div className="page-stack staff-pool-page">
      <Card className="staff-pool-hero"><div className="ui-card-content"><div><span className="eyebrow">Shared opportunity queue</span><h2>Choose work you can own.</h2><p>Every Lead here is New, unassigned and approved by Admin for staff self-selection. Claiming a Lead creates its default pursuit workflow and notifies Admin.</p></div><div className="staff-pool-count"><strong>{rows.length}</strong><span>available</span></div></div></Card>
      {error?<Alert tone="error">{error}</Alert>:null}
      <Card><div className="ui-card-content staff-pool-search"><Input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search available Leads…"/><span>{visible.length} shown</span></div></Card>
      {loading?<PageLoadingState/>:error&&!rows.length?<PageErrorState message={error}/>:visible.length?(
        <div className="staff-pool-grid">{visible.map((lead)=><article className="staff-pool-card" key={lead.id}><header><div><strong>{lead.organization_name}</strong><span>{lead.industry||'Industry not recorded'}</span></div><LeadPriorityPill priority={lead.priority}/></header><div className="staff-pool-card-body"><dl><div><dt>Source</dt><dd>{lead.source||'—'}</dd></div><div><dt>Website</dt><dd>{lead.organization_website||'—'}</dd></div><div><dt>Published</dt><dd>{lead.pool_published_at?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(lead.pool_published_at)):'Recently'}</dd></div></dl><p>Claim this Lead only if you can actively work the pursuit. Another staff member cannot claim it after you.</p></div><Button loading={claiming===lead.id} onClick={()=>void claim(lead.id)}>Pick this Lead</Button></article>)}</div>
      ):<Card><EmptyState icon="leads" title="No Leads available right now" description="Admin has not published any unassigned Leads to the pool, or other staff have already picked them."/></Card>}
    </div>
  </AppShell>;
}
