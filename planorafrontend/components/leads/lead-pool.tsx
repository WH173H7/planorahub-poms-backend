'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageErrorState } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { listLeads } from '@/lib/leads/api';
import { organizationLocation, ownerName } from '@/lib/leads/helpers';
import type { Lead } from '@/lib/leads/types';
import { AddLeadDialog } from './add-lead-dialog';
import { LeadMobileList } from './lead-mobile-list';
import { LeadSummary } from './lead-summary';
import { LeadTable } from './lead-table';
import { type LeadFilters, LeadToolbar } from './lead-toolbar';

const initialFilters: LeadFilters = { stage: 'ALL', owner: 'ALL', assignment: 'ALL', priority: 'ALL' };

export function LeadPool() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<LeadFilters>(initialFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => { setLoading(true); setError(null); try { const records = await listLeads(); setLeads(records); setSelected((current) => new Set([...current].filter((id) => records.some((lead) => lead.id === id)))); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load the Lead Pool.'); } finally { setLoading(false); } }, []);
  useEffect(() => {
    let active = true;
    listLeads()
      .then((records) => { if (active) setLeads(records); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load the Lead Pool.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const owners = useMemo(() => { const map = new Map<string, string>(); leads.forEach((lead) => { if (lead.assigned_to_id) map.set(lead.assigned_to_id, ownerName(lead)); }); return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)); }, [leads]);
  const visible = useMemo(() => { const query = search.trim().toLowerCase(); return leads.filter((lead) => { const searchable = [lead.organization_name, lead.organization_website, lead.industry, organizationLocation(lead), lead.source].filter(Boolean).join(' ').toLowerCase(); return (!query || searchable.includes(query)) && (filters.stage === 'ALL' || lead.stage === filters.stage) && (filters.owner === 'ALL' || lead.assigned_to_id === filters.owner) && (filters.assignment === 'ALL' || (filters.assignment === 'ASSIGNED' ? Boolean(lead.assigned_to_id) : !lead.assigned_to_id)) && (filters.priority === 'ALL' || lead.priority === filters.priority); }); }, [leads, search, filters]);
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAll() { const all = visible.length > 0 && visible.every((lead) => selected.has(lead.id)); setSelected((current) => { const next = new Set(current); visible.forEach((lead) => all ? next.delete(lead.id) : next.add(lead.id)); return next; }); }
  const filtered = search.trim() || Object.values(filters).some((value) => value !== 'ALL');

  return <AppShell area="admin" title="Leads" breadcrumb="Sales" description="Organizations your team is researching and pursuing." actions={<><Button variant="outline" disabled>Import · Coming Soon</Button><Button onClick={() => setAddOpen(true)}>+ Add Lead</Button></>}>
    {loading ? <LeadPoolSkeleton /> : error ? <div className="page-section"><PageErrorState message={error} /><Button variant="outline" onClick={() => void load()}>Retry</Button></div> : leads.length === 0 ? <div className="ui-card"><EmptyState icon="leads" title="No leads yet" description="Add an organization your team wants to research and pursue." action={<Button onClick={() => setAddOpen(true)}>+ Add Lead</Button>} /></div> : <><LeadSummary leads={leads} /><LeadToolbar search={search} onSearch={setSearch} filters={filters} onFilters={setFilters} owners={owners} selectedCount={selected.size} onClearSelection={() => setSelected(new Set())} />{visible.length === 0 ? <div className="ui-card"><EmptyState icon="search" title="No matching leads" description="Try changing your search or filters." action={filtered ? <Button variant="outline" onClick={() => { setSearch(''); setFilters(initialFilters); }}>Clear filters</Button> : undefined} /></div> : <><LeadTable leads={visible} selected={selected} onToggle={toggle} onToggleAll={toggleAll} /><LeadMobileList leads={visible} selected={selected} onToggle={toggle} /></>}</>}
    <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={async () => { setAddOpen(false); await load(); }} />
  </AppShell>;
}

function LeadPoolSkeleton() { return <div className="page-stack" aria-label="Loading leads" aria-busy="true"><div className="lead-summary">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} height={118} />)}</div><Skeleton height={48} /><Skeleton height={360} /></div>; }
