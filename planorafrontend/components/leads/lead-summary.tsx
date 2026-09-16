import type { Lead } from '@/lib/leads/types';

export function LeadSummary({ leads, onFilter }: { leads: Lead[]; onFilter?: (kind: 'ALL'|'UNASSIGNED'|'POOL'|'ACTIVE'|'REVIEW') => void }) {
  const values = [
    { key:'ALL' as const, label:'Total Leads', value:leads.length, note:'All active Lead records' },
    { key:'UNASSIGNED' as const, label:'Unassigned', value:leads.filter((lead) => !lead.assigned_to_id && !lead.assigned_team_id && !lead.available_in_pool).length, note:'Waiting for routing' },
    { key:'POOL' as const, label:'Lead Pool', value:leads.filter((lead) => lead.available_in_pool).length, note:'Available for staff pickup' },
    { key:'ACTIVE' as const, label:'Active Pursuit', value:leads.filter((lead) => !['NEW','READY_FOR_PROSPECT_REVIEW','DISQUALIFIED','UNQUALIFIED'].includes(lead.stage)).length, note:'Currently being worked' },
    { key:'REVIEW' as const, label:'Ready for Review', value:leads.filter((lead) => lead.stage === 'READY_FOR_PROSPECT_REVIEW').length, note:'Awaiting Prospect decision' },
  ];

  return <div className="lead-summary lead-summary-polished">{values.map((item) => (
    <button key={item.key} type="button" className="lead-summary-card" onClick={() => onFilter?.(item.key)}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.note}</small>
    </button>
  ))}</div>;
}
