'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ownerName } from '@/lib/leads/helpers';
import type { Lead } from '@/lib/leads/types';
import { LeadPriorityPill, LeadStagePill } from './lead-status';

function routeLabel(lead: Lead) {
  if (lead.claimed_by_id) return `Self-selected by ${ownerName(lead)}`;
  if (lead.assigned_team_id) return `Team · ${lead.assigned_team_name}`;
  if (lead.assigned_to_id) return ownerName(lead);
  if (lead.available_in_pool) return 'Available in Lead Pool';
  return 'Unassigned';
}

export function LeadMobileList({ leads, selected, onToggle }: { leads: Lead[]; selected: Set<string>; onToggle: (id: string) => void }) {
  const router = useRouter();
  return <div className="lead-mobile-list">{leads.map((lead) => (
    <Card key={lead.id} className="lead-mobile-card lead-mobile-card-clickable" onClick={() => router.push(`/leads/${lead.id}`)}>
      <div className="lead-mobile-heading">
        <label onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${lead.organization_name}`} checked={selected.has(lead.id)} onChange={() => onToggle(lead.id)} /><span className="sr-only">Select lead</span></label>
        <div><strong>{lead.organization_name}</strong><span>{lead.industry || lead.organization_website || 'Organization lead'}</span></div>
      </div>
      <div className="lead-mobile-pills"><LeadStagePill stage={lead.stage} /><LeadPriorityPill priority={lead.priority} /></div>
      <dl className="lead-mobile-meta"><div><dt>Routing</dt><dd>{routeLabel(lead)}</dd></div><div><dt>Progress</dt><dd><span>{lead.pursuit_progress}%</span><Progress value={lead.pursuit_progress} /></dd></div><div><dt>Source</dt><dd>{lead.source || '—'}</dd></div></dl>
      <span className="lead-card-open">Open Lead →</span>
    </Card>
  ))}</div>;
}
