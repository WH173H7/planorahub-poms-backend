'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { listLeads, removeLeadFromPool } from '@/lib/leads/api';
import type { Lead } from '@/lib/leads/types';
import { LeadPriorityPill } from './lead-status';

export function AdminLeadPoolView(){
  const[rows,setRows]=useState<Lead[]>([]),[search,setSearch]=useState(''),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
  async function load(){try{setRows((await listLeads()).filter((lead)=>lead.available_in_pool));setError(null);}catch(caught){setError(caught instanceof Error?caught.message:'Unable to load Lead Pool.');}}
  useEffect(()=>{void load();},[]);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter((lead)=>!q||[lead.organization_name,lead.industry,lead.source].filter(Boolean).join(' ').toLowerCase().includes(q));},[rows,search]);
  return <AppShell area="admin" title="Lead Pool" breadcrumb="Sales / Leads" description="The shared queue of unassigned Leads that staff are permitted to self-select." actions={<Link href="/leads"><Button variant="outline">Back to Leads</Button></Link>}>
    <div className="page-stack admin-pool-page">
      <Card className="lead-pool-admin-hero"><div className="ui-card-content"><div><span className="eyebrow">Staff self-selection</span><h2>Control what enters the shared pool.</h2><p>Publishing a Lead does not assign it. The first eligible staff member to claim it receives ownership, the default pursuit workflow, and Admin is notified.</p></div><Badge tone="purple">{rows.length} available</Badge></div></Card>
      {error?<div className="form-error">{error}</div>:null}
      <Card><div className="ui-card-content staff-pool-search"><Input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search pool…"/><span>{visible.length} shown</span></div></Card>
      {visible.length?<div className="admin-pool-grid">{visible.map((lead)=><article className="admin-pool-card" key={lead.id}><header><div><strong>{lead.organization_name}</strong><span>{lead.industry||'Organization Lead'}</span></div><LeadPriorityPill priority={lead.priority}/></header><dl><div><dt>Source</dt><dd>{lead.source||'—'}</dd></div><div><dt>Published by</dt><dd>{[lead.pool_published_by_first_name,lead.pool_published_by_last_name].filter(Boolean).join(' ')||'System'}</dd></div><div><dt>Published</dt><dd>{lead.pool_published_at?new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(lead.pool_published_at)):'—'}</dd></div></dl><footer><Link href={`/leads/${lead.id}`}><Button size="sm" variant="outline">Open Lead</Button></Link><Button size="sm" variant="ghost" loading={busy===lead.id} onClick={async()=>{setBusy(lead.id);try{await removeLeadFromPool(lead.id);await load();}finally{setBusy(null);}}}>Remove from pool</Button></footer></article>)}</div>:<Card><EmptyState icon="leads" title="Lead Pool is empty" description="Select New, unassigned Leads on the Leads page and choose Send to Lead Pool."/></Card>}
    </div>
  </AppShell>;
}
