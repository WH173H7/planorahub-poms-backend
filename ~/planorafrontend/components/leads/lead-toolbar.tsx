import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { LeadPriority, LeadStage } from '@/lib/leads/types';
import { LEAD_PRIORITIES, LEAD_STAGES } from '@/lib/leads/types';
import { priorityLabel, stageLabel } from '@/lib/leads/helpers';

export type LeadFilters = {
  stage: LeadStage | 'ALL';
  owner: string;
  assignment: 'ALL' | 'ASSIGNED' | 'UNASSIGNED' | 'POOL';
  priority: LeadPriority | 'ALL';
};

type Props = {
  search: string;
  onSearch: (value: string) => void;
  filters: LeadFilters;
  onFilters: (filters: LeadFilters) => void;
  owners: { id: string; name: string }[];
  selectedCount: number;
  onAssignSelected: () => void;
  onPoolSelected: () => void;
  poolBusy?: boolean;
  onClearSelection: () => void;
};

export function LeadToolbar({
  search,
  onSearch,
  filters,
  onFilters,
  owners,
  selectedCount,
  onAssignSelected,
  onPoolSelected,
  poolBusy = false,
  onClearSelection,
}: Props) {
  return (
    <div className="lead-toolbar lead-toolbar-polished">
      <div className="lead-toolbar-topline">
        <div>
          <strong>Lead directory</strong>
          <span>Search, filter and route organization Leads.</span>
        </div>
        <div className="lead-search">
          <Input
            aria-label="Search leads"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search organization, website, industry or location…"
          />
        </div>
      </div>

      <div className="lead-filter-row">
        <NativeSelect
          aria-label="Filter by stage"
          value={filters.stage}
          onChange={(event) => onFilters({ ...filters, stage: event.target.value as LeadFilters['stage'] })}
        >
          <option value="ALL">All stages</option>
          {LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
        </NativeSelect>

        <NativeSelect
          aria-label="Filter by owner"
          value={filters.owner}
          onChange={(event) => onFilters({ ...filters, owner: event.target.value })}
        >
          <option value="ALL">All owners</option>
          {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
        </NativeSelect>

        <NativeSelect
          aria-label="Filter by assignment"
          value={filters.assignment}
          onChange={(event) => onFilters({ ...filters, assignment: event.target.value as LeadFilters['assignment'] })}
        >
          <option value="ALL">Any routing</option>
          <option value="UNASSIGNED">Unassigned</option>
          <option value="POOL">Published to Lead Pool</option>
          <option value="ASSIGNED">Assigned / claimed</option>
        </NativeSelect>

        <NativeSelect
          aria-label="Filter by priority"
          value={filters.priority}
          onChange={(event) => onFilters({ ...filters, priority: event.target.value as LeadFilters['priority'] })}
        >
          <option value="ALL">All priorities</option>
          {LEAD_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}
        </NativeSelect>
      </div>

      {selectedCount ? (
        <div className="bulk-bar lead-bulk-bar">
          <div>
            <strong>{selectedCount} selected</strong>
            <span>Assign directly or make the selected Leads available for staff self-selection.</span>
          </div>
          <div className="bulk-bar-actions">
            <Button size="sm" variant="outline" loading={poolBusy} onClick={onPoolSelected}>Send to Lead Pool</Button>
            <Button size="sm" onClick={onAssignSelected}>Assign selected</Button>
            <Button size="sm" variant="ghost" onClick={onClearSelection}>Clear</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
