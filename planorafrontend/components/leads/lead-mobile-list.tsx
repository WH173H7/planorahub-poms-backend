import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { ownerName } from '@/lib/leads/helpers';
import type { Lead } from '@/lib/leads/types';
import { LeadPriorityPill, LeadStagePill } from './lead-status';

export function LeadMobileList({ leads, selected, onToggle }: { leads: Lead[]; selected: Set<string>; onToggle: (id: string) => void }) {
  return <div className="lead-mobile-list">{leads.map((lead) => <Card key={lead.id} className="lead-mobile-card"><div className="lead-mobile-heading"><label><input type="checkbox" aria-label={`Select ${lead.organization_name}`} checked={selected.has(lead.id)} onChange={() => onToggle(lead.id)} /><span className="sr-only">Select lead</span></label><div><strong><Link href={`/leads/${lead.id}`}>{lead.organization_name}</Link></strong><span>{lead.industry || lead.organization_website || 'Organization lead'}</span></div></div><div className="lead-mobile-pills"><LeadStagePill stage={lead.stage} /><LeadPriorityPill priority={lead.priority} /></div><dl className="lead-mobile-meta"><div><dt>Owner</dt><dd>{ownerName(lead)}</dd></div><div><dt>Progress</dt><dd><span>{lead.pursuit_progress}%</span><Progress value={lead.pursuit_progress} /></dd></div></dl><Link className="row-action" href={`/leads/${lead.id}`}>Open workspace →</Link></Card>)}</div>;
}
