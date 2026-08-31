import { MetricCard } from '@/components/ui/metric-card';
import type { Lead } from '@/lib/leads/types';

export function LeadSummary({ leads }: { leads: Lead[] }) {
  const values = [
    ['Total Leads', leads.length],
    ['Unassigned', leads.filter((lead) => !lead.assigned_to_id).length],
    ['Assigned', leads.filter((lead) => Boolean(lead.assigned_to_id)).length],
    ['Active Pursuit', leads.filter((lead) => !['NEW', 'READY_FOR_PROSPECT_REVIEW', 'DISQUALIFIED', 'UNQUALIFIED'].includes(lead.stage)).length],
    ['Ready for Review', leads.filter((lead) => lead.stage === 'READY_FOR_PROSPECT_REVIEW').length],
  ] as const;

  return <div className="lead-summary">{values.map(([label, value]) => <MetricCard key={label} label={label} value={String(value)} note="Current Lead Pool" />)}</div>;
}
