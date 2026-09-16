'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageErrorState } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { listLeads, publishLeadsToPool } from '@/lib/leads/api';
import { organizationLocation, ownerName } from '@/lib/leads/helpers';
import type { Lead } from '@/lib/leads/types';
import { AddLeadDialog } from './add-lead-dialog';
import { AssignLeadsDialog } from './assign-leads-dialog';
import { LeadMobileList } from './lead-mobile-list';
import { ImportLeadsDialog } from './import-leads-dialog';
import { LeadSummary } from './lead-summary';
import { LeadTable } from './lead-table';
import { type LeadFilters, LeadToolbar } from './lead-toolbar';

const initialFilters: LeadFilters = { stage: 'ALL', owner: 'ALL', assignment: 'ALL', priority: 'ALL' };

export function LeadPool() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<LeadFilters>(initialFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [poolBusy, setPoolBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const records = await listLeads();
      setLeads(records);
      setSelected((current) => new Set([...current].filter((id) => records.some((lead) => lead.id === id))));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Leads.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    leads.forEach((lead) => { if (lead.assigned_to_id) map.set(lead.assigned_to_id, ownerName(lead)); });
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const searchable = [lead.organization_name, lead.organization_website, lead.industry, organizationLocation(lead), lead.source].filter(Boolean).join(' ').toLowerCase();
      const routed = Boolean(lead.assigned_to_id || lead.assigned_team_id);
      const assignmentMatches = filters.assignment === 'ALL'
        || (filters.assignment === 'POOL' && lead.available_in_pool)
        || (filters.assignment === 'ASSIGNED' && routed)
        || (filters.assignment === 'UNASSIGNED' && !routed && !lead.available_in_pool);
      return (!query || searchable.includes(query))
        && (filters.stage === 'ALL' || lead.stage === filters.stage)
        && (filters.owner === 'ALL' || lead.assigned_to_id === filters.owner)
        && assignmentMatches
        && (filters.priority === 'ALL' || lead.priority === filters.priority);
    });
  }, [leads, search, filters]);

  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAll() { const all = visible.length > 0 && visible.every((lead) => selected.has(lead.id)); setSelected((current) => { const next = new Set(current); visible.forEach((lead) => all ? next.delete(lead.id) : next.add(lead.id)); return next; }); }
  const filtered = search.trim() || Object.values(filters).some((value) => value !== 'ALL');

  function quickFilter(kind: 'ALL'|'UNASSIGNED'|'POOL'|'ACTIVE'|'REVIEW') {
    if (kind === 'ALL') setFilters(initialFilters);
    if (kind === 'UNASSIGNED') setFilters({ ...initialFilters, assignment:'UNASSIGNED' });
    if (kind === 'POOL') setFilters({ ...initialFilters, assignment:'POOL' });
    if (kind === 'REVIEW') setFilters({ ...initialFilters, stage:'READY_FOR_PROSPECT_REVIEW' });
    if (kind === 'ACTIVE') setFilters({ ...initialFilters, assignment:'ASSIGNED' });
  }

  async function sendSelectedToPool() {
    const ids=[...selected];
    if (!ids.length) return;
    setPoolBusy(true); setError(null); setSuccess(null);
    try {
      const result=await publishLeadsToPool(ids);
      setSelected(new Set());
      await load();
      setSuccess(`${result.count} Lead${result.count===1?'':'s'} published to the shared Lead Pool.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to publish these Leads to the Lead Pool.');
    } finally { setPoolBusy(false); }
  }

  return <AppShell
    area="admin"
    title="Leads"
    breadcrumb="Sales"
    description="Research opportunities, route ownership and monitor pursuit progress before a relationship becomes a Prospect."
    actions={<><Link href="/lead-pool"><Button variant="outline">Lead Pool</Button></Link><Link href="/lead-workflows"><Button variant="outline">Workflows</Button></Link><Button variant="outline" onClick={() => setImportOpen(true)}>Import Leads</Button><Button onClick={() => setAddOpen(true)}>+ Add Lead</Button></>}
  >
    <div className="page-stack leads-page-polished">
      {success ? <Alert tone="success">{success}</Alert> : null}
      {loading ? <LeadPoolSkeleton /> : error ? <div className="page-section"><PageErrorState message={error} /><Button variant="outline" onClick={() => void load()}>Retry</Button></div> : leads.length === 0 ? <div className="ui-card"><EmptyState icon="leads" title="No Leads yet" description="Add an organization your team wants to research and pursue." action={<Button onClick={() => setAddOpen(true)}>+ Add Lead</Button>} /></div> : <>
        <LeadSummary leads={leads} onFilter={quickFilter} />
        <LeadToolbar search={search} onSearch={setSearch} filters={filters} onFilters={setFilters} owners={owners} selectedCount={selected.size} onAssignSelected={() => setAssignOpen(true)} onPoolSelected={() => void sendSelectedToPool()} poolBusy={poolBusy} onClearSelection={() => setSelected(new Set())} />
        {visible.length === 0 ? <div className="ui-card"><EmptyState icon="search" title="No matching Leads" description="Try changing your search or filters." action={filtered ? <Button variant="outline" onClick={() => { setSearch(''); setFilters(initialFilters); }}>Clear filters</Button> : undefined} /></div> : <><LeadTable leads={visible} selected={selected} onToggle={toggle} onToggleAll={toggleAll} /><LeadMobileList leads={visible} selected={selected} onToggle={toggle} /></>}
      </>}
    </div>
    <ImportLeadsDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
    <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={async () => { setAddOpen(false); await load(); }} />
    <AssignLeadsDialog open={assignOpen} leads={leads.filter((lead) => selected.has(lead.id))} onClose={() => setAssignOpen(false)} onAssigned={async () => { setSelected(new Set()); await load(); }} />
  </AppShell>;
}

function LeadPoolSkeleton() { return <div className="page-stack" aria-label="Loading leads" aria-busy="true"><div className="lead-summary">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} height={118} />)}</div><Skeleton height={130} /><Skeleton height={360} /></div>; }
