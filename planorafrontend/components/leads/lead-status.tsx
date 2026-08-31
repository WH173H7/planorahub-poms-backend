import { StatusPill } from '@/components/ui/status-pill';
import { priorityLabel, priorityTone, stageLabel, stageTone } from '@/lib/leads/helpers';
import type { LeadPriority, LeadStage } from '@/lib/leads/types';

export function LeadStagePill({ stage }: { stage: LeadStage }) {
  return <StatusPill tone={stageTone(stage)}>{stageLabel(stage)}</StatusPill>;
}
export function LeadPriorityPill({ priority }: { priority: LeadPriority }) {
  return <StatusPill tone={priorityTone(priority)}>{priorityLabel(priority)}</StatusPill>;
}
