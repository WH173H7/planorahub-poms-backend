'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import { canUseCompanyActivities } from '@/lib/auth/routing';
import { listFollowUps, updateActivity } from '@/lib/leads/api';
import type { Activity } from '@/lib/leads/types';

const scheduleNames = ['Overdue', 'Due today', 'Upcoming', 'Completed', 'Cancelled'] as const;
type ScheduleName = (typeof scheduleNames)[number];

const fmtDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : 'Not scheduled';

export function FollowUpsView() {
  const [staff, setStaff] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ScheduleName>('Due today');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('ALL');
  const [reschedule, setReschedule] = useState<Activity | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const user = await getCurrentCrmUser();
      const isStaff = !canUseCompanyActivities(user);
      setStaff(isStaff);
      setRows(await listFollowUps(isStaff));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load follow-ups.');
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const groups = useMemo(() => groupRows(rows), [rows]);
  const owners = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      const name = [row.assignee_first_name, row.assignee_last_name].filter(Boolean).join(' ');
      if (name) values.add(name);
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const visible = useMemo(() => groups[active].filter((row) => {
    const ownerName = [row.assignee_first_name, row.assignee_last_name].filter(Boolean).join(' ');
    if (owner !== 'ALL' && ownerName !== owner) return false;
    const haystack = `${row.title} ${row.description ?? ''} ${row.lead_title ?? ''} ${row.organization_name ?? ''} ${ownerName} ${row.contact_first_name ?? ''} ${row.contact_last_name ?? ''}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [active, groups, owner, query]);

  if (error) return <AppShell area={staff ? 'staff' : 'admin'} title="Follow-ups" breadcrumb="Work"><PageErrorState message={error} /></AppShell>;
  if (staff === null) return <main><PageLoadingState /></main>;

  async function change(row: Activity, status: Activity['status'], scheduledAt?: string) {
    await updateActivity(row.id, { status, scheduledAt: scheduledAt ?? row.scheduled_at }, staff!);
    await load();
  }

  const openHref = (row: Activity) => row.lead_id ? (staff ? `/my-work/leads/${row.lead_id}` : `/leads/${row.lead_id}`) : null;

  return (
    <AppShell
      area={staff ? 'staff' : 'admin'}
      title="Follow-ups"
      breadcrumb="Work"
      description="Stay ahead of every scheduled touchpoint. Review what is late, due now and coming next without losing the Lead context."
    >
      <div className="page-stack followup-v2-page">
        <section className="followup-v2-summary" aria-label="Follow-up summary">
          <SummaryCard label="Overdue" value={groups.Overdue.length} note="Needs attention" tone="danger" active={active === 'Overdue'} onClick={() => setActive('Overdue')} />
          <SummaryCard label="Due today" value={groups['Due today'].length} note="Today's commitments" tone="warning" active={active === 'Due today'} onClick={() => setActive('Due today')} />
          <SummaryCard label="Upcoming" value={groups.Upcoming.length} note="Future schedule" tone="purple" active={active === 'Upcoming'} onClick={() => setActive('Upcoming')} />
          <SummaryCard label="Completed" value={groups.Completed.length} note="Recently finished" tone="success" active={active === 'Completed'} onClick={() => setActive('Completed')} />
        </section>

        <Card className="followup-v2-control-card">
          <div className="ui-card-content followup-v2-controls">
            <div className="followup-v2-control-copy">
              <span className="eyebrow">Schedule workspace</span>
              <strong>{active}</strong>
              <small>{groups[active].length} follow-up{groups[active].length === 1 ? '' : 's'} in this view</small>
            </div>
            <div className="followup-v2-filters">
              <Input placeholder="Search Lead, contact or follow-up…" value={query} onChange={(event) => setQuery(event.target.value)} />
              {!staff ? <NativeSelect value={owner} onChange={(event) => setOwner(event.target.value)}><option value="ALL">All owners</option>{owners.map((name) => <option key={name} value={name}>{name}</option>)}</NativeSelect> : null}
            </div>
          </div>
          <div className="followup-v2-tabs" role="tablist" aria-label="Follow-up status">
            {scheduleNames.map((name) => <button key={name} role="tab" aria-selected={active === name} className={active === name ? 'is-active' : ''} onClick={() => setActive(name)}><span>{name}</span><b>{groups[name].length}</b></button>)}
          </div>
        </Card>

        <Card className="followup-v2-workspace">
          <header className="followup-v2-workspace-head">
            <div><span className="eyebrow">{active === 'Completed' || active === 'Cancelled' ? 'History' : 'Action queue'}</span><h2>{active}</h2><p>{activeDescription(active)}</p></div>
            <Badge tone={groupTone(active)}>{visible.length} shown</Badge>
          </header>
          {visible.length ? <div className="followup-v2-list">{visible.map((row) => <FollowupRow key={row.id} row={row} href={openHref(row)} onChange={change} onReschedule={() => setReschedule(row)} />)}</div> : <EmptyState icon="followups" title={`No ${active.toLowerCase()} follow-ups`} description={query || owner !== 'ALL' ? 'No follow-ups match the current filters.' : 'There is nothing in this part of the schedule right now.'} />}
        </Card>
      </div>
      {reschedule ? <RescheduleModal row={reschedule} close={() => setReschedule(null)} save={async (value) => { await change(reschedule, reschedule.status, value); setReschedule(null); }} /> : null}
    </AppShell>
  );
}

function SummaryCard({ label, value, note, tone, active, onClick }: { label: string; value: number; note: string; tone: string; active: boolean; onClick: () => void }) {
  return <button className={`followup-v2-summary-card tone-${tone}${active ? ' is-active' : ''}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{note}</small></button>;
}

function FollowupRow({ row, href, onChange, onReschedule }: { row: Activity; href: string | null; onChange: (row: Activity, status: Activity['status'], scheduledAt?: string) => Promise<void>; onReschedule: () => void }) {
  const active = !['COMPLETED', 'CANCELLED'].includes(row.status);
  const owner = [row.assignee_first_name, row.assignee_last_name].filter(Boolean).join(' ') || 'Unassigned';
  const contact = [row.contact_first_name, row.contact_last_name].filter(Boolean).join(' ') || 'No contact selected';
  return <article className="followup-v2-row">
    <div className={`followup-v2-type type-${row.activity_type.toLowerCase()}`}>{activityMark(row.activity_type)}</div>
    <div className="followup-v2-main">
      <header><div><strong>{row.title}</strong><span>{row.lead_title || row.organization_name || 'General follow-up'}</span></div><Badge tone={statusTone(row.status)}>{row.status.replaceAll('_', ' ')}</Badge></header>
      {row.description ? <p>{row.description}</p> : null}
      <div className="followup-v2-meta"><span><b>When</b>{fmtDateTime(row.scheduled_at || row.next_follow_up_at)}</span><span><b>Owner</b>{owner}</span><span><b>Contact</b>{contact}</span><span><b>Type</b>{row.activity_type.replaceAll('_', ' ')}</span></div>
    </div>
    <div className="followup-v2-actions">
      {href ? <Link href={href} className="followup-v2-open">Open Lead →</Link> : null}
      {active ? <><Button size="sm" onClick={() => void onChange(row, 'COMPLETED')}>Complete</Button><Button size="sm" variant="outline" onClick={onReschedule}>Reschedule</Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Cancel this follow-up?')) void onChange(row, 'CANCELLED'); }}>Cancel</Button></> : null}
    </div>
  </article>;
}

function RescheduleModal({ row, close, save }: { row: Activity; close: () => void; save: (value: string) => Promise<void> }) {
  const current = row.scheduled_at ? toLocalInput(row.scheduled_at) : '';
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  return <Modal open onClose={close} title="Reschedule follow-up"><form className="stack" onSubmit={async (event) => { event.preventDefault(); if (!value) return; setSaving(true); try { await save(new Date(value).toISOString()); } finally { setSaving(false); } }}><div className="followup-v2-reschedule-note"><span className="eyebrow">{row.lead_title || row.organization_name || 'Follow-up'}</span><strong>{row.title}</strong><p>Choose the new date and time. The Lead's next-follow-up value will update automatically.</p></div><Input label="New date & time *" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} required/><div className="task-form-actions"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={saving}>Save schedule</Button></div></form></Modal>;
}

function toLocalInput(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); }
function activityMark(type: Activity['activity_type']) { return ({ CALL: '☎', MEETING: '◉', EMAIL: '✉', FOLLOW_UP: '↻', NOTE: '✎', OTHER: '•' } as Record<Activity['activity_type'], string>)[type]; }
function statusTone(status: Activity['status']) { if (status === 'COMPLETED') return 'success' as const; if (status === 'CANCELLED') return 'danger' as const; if (status === 'IN_PROGRESS') return 'purple' as const; return 'warning' as const; }
function groupTone(name: ScheduleName) { if (name === 'Overdue') return 'danger' as const; if (name === 'Due today') return 'warning' as const; if (name === 'Completed') return 'success' as const; if (name === 'Upcoming') return 'purple' as const; return 'neutral' as const; }
function activeDescription(name: ScheduleName) { return ({ Overdue: 'Late follow-ups that need a decision or new schedule.', 'Due today': 'The commitments your team should complete today.', Upcoming: 'Future Lead touchpoints already on the calendar.', Completed: 'Follow-ups your team has finished.', Cancelled: 'Cancelled follow-ups retained for operational history.' } as Record<ScheduleName, string>)[name]; }

function groupRows(rows: Activity[]) {
  const groups: Record<ScheduleName, Activity[]> = { Overdue: [], 'Due today': [], Upcoming: [], Completed: [], Cancelled: [] };
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const end = start + 86400000;
  for (const row of rows) {
    if (row.status === 'COMPLETED') { groups.Completed.push(row); continue; }
    if (row.status === 'CANCELLED') { groups.Cancelled.push(row); continue; }
    const when = new Date(row.scheduled_at || row.next_follow_up_at || 0).getTime();
    if (when < start) groups.Overdue.push(row); else if (when < end) groups['Due today'].push(row); else groups.Upcoming.push(row);
  }
  return groups;
}
