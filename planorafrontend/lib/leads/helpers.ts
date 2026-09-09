import type { Lead, LeadPriority, LeadStage } from './types';
import type { Tone } from '@/components/ui/badge';

const stageLabels: Record<LeadStage, string> = {
  NEW: 'New', ASSIGNED: 'Assigned', RESEARCHING: 'Researching',
  CONTACT_FOUND: 'Contact found', CONTACTED: 'Contacted',
  AWAITING_REPLY: 'Awaiting reply', FOLLOW_UP: 'Follow-up', ENGAGED: 'Engaged',
  READY_FOR_PROSPECT_REVIEW: 'Ready for review', QUALIFIED: 'Qualified',
  NURTURE: 'Nurture', UNQUALIFIED: 'Unqualified', DISQUALIFIED: 'Disqualified',
};

export function stageLabel(stage: LeadStage) { return stageLabels[stage]; }
export function priorityLabel(priority: LeadPriority) { return priority[0] + priority.slice(1).toLowerCase(); }

export function stageTone(stage: LeadStage): Tone {
  if (stage === 'READY_FOR_PROSPECT_REVIEW' || stage === 'QUALIFIED') return 'success';
  if (stage === 'DISQUALIFIED' || stage === 'UNQUALIFIED') return 'danger';
  if (stage === 'NEW' || stage === 'ASSIGNED') return 'neutral';
  if (stage === 'AWAITING_REPLY' || stage === 'FOLLOW_UP' || stage === 'NURTURE') return 'warning';
  return 'purple';
}

export function priorityTone(priority: LeadPriority): Tone {
  return priority === 'URGENT' ? 'danger' : priority === 'HIGH' ? 'warning' : priority === 'MEDIUM' ? 'purple' : 'neutral';
}

export function ownerName(lead: Lead) {
  return lead.owner_first_name ? `${lead.owner_first_name} ${lead.owner_last_name ?? ''}`.trim() : 'Unassigned';
}

export function organizationLocation(lead: Lead) {
  return [lead.organization_city, lead.organization_state, lead.organization_country].filter(Boolean).join(', ');
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}
