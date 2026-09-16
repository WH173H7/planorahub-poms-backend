'use client';

import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { Table } from '@/components/ui/table';
import { formatDate, organizationLocation, ownerName } from '@/lib/leads/helpers';
import type { Lead } from '@/lib/leads/types';
import { LeadPriorityPill, LeadStagePill } from './lead-status';

function Routing({ lead }: { lead: Lead }) {
  if (lead.claimed_by_id) {
    return <div className="lead-routing"><strong>{ownerName(lead)}</strong><span className="lead-route-badge pool-claim">Self-selected · Lead Pool</span></div>;
  }
  if (lead.assigned_team_id) {
    return <div className="lead-routing"><strong>Team · {lead.assigned_team_name}</strong><span className="lead-route-badge">Team assignment</span></div>;
  }
  if (lead.assigned_to_id) {
    return <div className="lead-routing"><strong>{ownerName(lead)}</strong><span className="lead-route-badge">Admin assigned</span></div>;
  }
  if (lead.available_in_pool) {
    return <div className="lead-routing"><strong>Lead Pool</strong><span className="lead-route-badge pool-open">Available to staff</span></div>;
  }
  return <div className="lead-routing"><strong className="unassigned-owner">Unassigned</strong><span>Not yet routed</span></div>;
}

export function LeadTable({ leads, selected, onToggle, onToggleAll }: { leads: Lead[]; selected: Set<string>; onToggle: (id: string) => void; onToggleAll: () => void }) {
  const router = useRouter();
  const allSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.id));
  return (
    <div className="lead-table-view lead-table-polished">
      <Table>
        <thead><tr><th className="select-column"><input type="checkbox" aria-label="Select all visible leads" checked={allSelected} onChange={onToggleAll} /></th><th>Organization</th><th>Stage</th><th>Routing</th><th>Source</th><th>Progress</th><th>Priority</th><th>Updated</th></tr></thead>
        <tbody>{leads.map((lead) => (
          <tr
            key={lead.id}
            data-selected={selected.has(lead.id)}
            className="clickable-lead-row"
            tabIndex={0}
            role="link"
            onClick={() => router.push(`/leads/${lead.id}`)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') router.push(`/leads/${lead.id}`); }}
          >
            <td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${lead.organization_name}`} checked={selected.has(lead.id)} onChange={() => onToggle(lead.id)} /></td>
            <td><div className="lead-org"><strong>{lead.organization_name}</strong><span>{lead.industry || lead.organization_website || organizationLocation(lead) || 'Organization Lead'}</span></div></td>
            <td><LeadStagePill stage={lead.stage} /></td>
            <td><Routing lead={lead} /></td>
            <td>{lead.source || <span className="muted">—</span>}</td>
            <td><div className="lead-progress"><span>{lead.pursuit_progress}%</span><Progress value={lead.pursuit_progress} /></div></td>
            <td><LeadPriorityPill priority={lead.priority} /></td>
            <td>{formatDate(lead.updated_at || lead.created_at)}</td>
          </tr>
        ))}</tbody>
      </Table>
    </div>
  );
}
