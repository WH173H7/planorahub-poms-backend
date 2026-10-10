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
import styles from '@/components/staff/followup-calendar.module.css';

type Filter = 'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
type ViewMode = 'QUEUE' | 'TIMELINE';
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'ALL', label: 'All follow-ups' },
  { id: 'OVERDUE', label: 'Overdue' },
  { id: 'TODAY', label: 'Due today' },
  { id: 'UPCOMING', label: 'Upcoming' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

const fmtDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : 'Not scheduled';
const person = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(' ');

export function FollowUpsViewP304() {
  const [staff, setStaff] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('ALL');
  const [view, setView] = useState<ViewMode>('QUEUE');
  const [reschedule, setReschedule] = useState<Activity | null>(null);
  const [clock, setClock] = useState<number>(() => Date.now());

  const load = useCallback(async () => {
    try {
      setError(null);
      const user = await getCurrentCrmUser();
      const isStaff = !canUseCompanyActivities(user);
      setStaff(isStaff);
      setRows(await listFollowUps(isStaff));
      setClock(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load follow-ups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const groups = useMemo(() => groupRows(rows, clock), [rows, clock]);
  const owners = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      const name = person(row.assignee_first_name, row.assignee_last_name);
      if (name) values.add(name);
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const base = active === 'ALL' ? rows : groups[active];
    return base.filter((row) => {
      const ownerName = person(row.assignee_first_name, row.assignee_last_name);
      if (owner !== 'ALL' && ownerName !== owner) return false;
      const haystack = `${row.title} ${row.description ?? ''} ${row.outcome ?? ''} ${row.lead_title ?? ''} ${row.organization_name ?? ''} ${ownerName} ${row.contact_first_name ?? ''} ${row.contact_last_name ?? ''}`.toLowerCase();
      return !query.trim() || haystack.includes(query.trim().toLowerCase());
    });
  }, [active, groups, owner, query, rows]);

  const timelineGroups = useMemo(() => groupTimeline(filteredRows, clock), [filteredRows, clock]);

  if (error) return <AppShell area={staff ? 'staff' : 'admin'} title="Follow-ups" breadcrumb="Work"><PageErrorState message={error} /></AppShell>;
  if (staff === null || (loading && rows.length === 0)) return <main><PageLoadingState /></main>;

  async function change(row: Activity, status: Activity['status'], scheduledAt?: string): Promise<boolean> {
    try {
      await updateActivity(row.id, { status, scheduledAt: scheduledAt ?? row.scheduled_at ?? undefined }, staff!);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update this follow-up.');
      return false;
    }
  }

  const openHref = (row: Activity) => row.lead_id ? (staff ? `/my-work/leads/${row.lead_id}` : `/leads/${row.lead_id}`) : null;

  return (
    <AppShell
      area={staff ? 'staff' : 'admin'}
      title="Follow-ups"
      breadcrumb="Work"
      description="One reliable place to see what is late, what is due next and the history behind every customer touchpoint."
      actions={<Link href="/calendar"><Button variant="outline">Open calendar ↗</Button></Link>}
    >
      <div className={`page-stack ${styles.followupPage}`}>
        <section className={styles.followupSummary} aria-label="Follow-up summary">
          <SummaryCard label="Overdue" value={groups.OVERDUE.length} note="Needs attention" tone="danger" active={active === 'OVERDUE'} onClick={() => setActive('OVERDUE')} />
          <SummaryCard label="Due today" value={groups.TODAY.length} note="Today's commitments" tone="warning" active={active === 'TODAY'} onClick={() => setActive('TODAY')} />
          <SummaryCard label="Upcoming" value={groups.UPCOMING.length} note="Future schedule" tone="purple" active={active === 'UPCOMING'} onClick={() => setActive('UPCOMING')} />
          <SummaryCard label="Completed" value={groups.COMPLETED.length} note="Finished touchpoints" tone="success" active={active === 'COMPLETED'} onClick={() => setActive('COMPLETED')} />
        </section>

        <Card className={styles.followupControlCard}>
          <div className={styles.followupControls}>
            <div className={styles.followupControlCopy}>
              <span className="eyebrow">Follow-up workspace</span>
              <strong>{filters.find((filter) => filter.id === active)?.label}</strong>
              <small>{filteredRows.length} matching touchpoint{filteredRows.length === 1 ? '' : 's'}</small>
            </div>
            <div className={styles.followupFilters}>
              <Input aria-label="Search follow-ups" placeholder="Search organisation, contact or action…" value={query} onChange={(event) => setQuery(event.target.value)} />
              {!staff ? <NativeSelect aria-label="Filter by owner" value={owner} onChange={(event) => setOwner(event.target.value)}><option value="ALL">All owners</option>{owners.map((name) => <option key={name} value={name}>{name}</option>)}</NativeSelect> : null}
            </div>
          </div>
          <div className={styles.followupToolbar}>
            <div className={styles.followupTabs} role="tablist" aria-label="Follow-up status">
              {filters.map((filter) => <button key={filter.id} type="button" role="tab" aria-selected={active === filter.id} className={active === filter.id ? styles.activeTab : ''} onClick={() => setActive(filter.id)}><span>{filter.label}</span><b>{filter.id === 'ALL' ? rows.length : groups[filter.id].length}</b></button>)}
            </div>
            <div className={styles.followupViewSwitch} aria-label="Follow-up view">
              <button type="button" aria-pressed={view === 'QUEUE'} className={view === 'QUEUE' ? styles.activeView : ''} onClick={() => setView('QUEUE')}>Queue</button>
              <button type="button" aria-pressed={view === 'TIMELINE'} className={view === 'TIMELINE' ? styles.activeView : ''} onClick={() => setView('TIMELINE')}>Timeline</button>
            </div>
          </div>
        </Card>

        {view === 'QUEUE' ? (
          <Card className={styles.followupWorkspace}>
            <header className={styles.followupWorkspaceHead}><div><span className="eyebrow">Action queue</span><h2>{filters.find((filter) => filter.id === active)?.label}</h2><p>Open the Lead to continue the conversation, complete a touchpoint or reschedule it with a clear date and time.</p></div><Badge tone={active === 'OVERDUE' ? 'danger' : active === 'TODAY' ? 'warning' : active === 'COMPLETED' ? 'success' : 'neutral'}>{filteredRows.length} shown</Badge></header>
            {filteredRows.length ? <div className={styles.followupList}>{filteredRows.slice().sort((a, b) => sortTime(a, b, active)).map((row) => <FollowupRow key={row.id} row={row} href={openHref(row)} onChange={change} onReschedule={() => setReschedule(row)} />)}</div> : <EmptyState icon="followups" title="Nothing in this view" description={query || owner !== 'ALL' ? 'No follow-ups match the current filters.' : 'There are no follow-ups in this part of the schedule.'} />}
          </Card>
        ) : (
          <Card className={styles.followupWorkspace}>
            <header className={styles.followupWorkspaceHead}><div><span className="eyebrow">Chronological record</span><h2>Follow-up timeline</h2><p>Review scheduled touchpoints and completed work in date order, with each item connected to its Lead where available.</p></div><Badge tone="neutral">{filteredRows.length} events</Badge></header>
            {timelineGroups.length ? <div className={styles.followupTimeline}>{timelineGroups.map((group) => <section key={group.key} className={styles.timelineGroup}><h3><span>{group.label}</span><b>{group.rows.length}</b></h3><div>{group.rows.map((row) => <FollowupRow key={row.id} row={row} href={openHref(row)} onChange={change} onReschedule={() => setReschedule(row)} compact />)}</div></section>)}</div> : <EmptyState icon="followups" title="No timeline events" description="Try another status or search term." />}
          </Card>
        )}
      </div>
      {reschedule ? <RescheduleModal row={reschedule} close={() => setReschedule(null)} save={async (value) => { const saved = await change(reschedule, reschedule.status, value); if (saved) setReschedule(null); return saved; }} /> : null}
    </AppShell>
  );
}

function SummaryCard({ label, value, note, tone, active, onClick }: { label: string; value: number; note: string; tone: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={`${styles.followupSummaryCard} ${styles[`tone_${tone}`]}${active ? ` ${styles.summaryActive}` : ''}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{note}</small></button>;
}

function FollowupRow({ row, href, onChange, onReschedule, compact = false }: { row: Activity; href: string | null; onChange: (row: Activity, status: Activity['status'], scheduledAt?: string) => Promise<boolean>; onReschedule: () => void; compact?: boolean }) {
  const active = !['COMPLETED', 'CANCELLED'].includes(row.status);
  const owner = person(row.assignee_first_name, row.assignee_last_name) || 'Unassigned';
  const contact = person(row.contact_first_name, row.contact_last_name) || 'No contact selected';
  const mark = ({ CALL: '☎', MEETING: '◉', EMAIL: '✉', FOLLOW_UP: '↻', NOTE: '✎', OTHER: '•' } as Record<Activity['activity_type'], string>)[row.activity_type];
  const tone = row.status === 'COMPLETED' ? 'success' : row.status === 'CANCELLED' ? 'danger' : 'warning';
  return <article className={`${styles.followupRow}${compact ? ` ${styles.followupRowCompact}` : ''}`}>
    <div className={`${styles.followupType} ${styles[`type_${row.activity_type.toLowerCase()}`]}`} aria-hidden="true">{mark}</div>
    <div className={styles.followupMain}>
      <header><div><strong>{row.title}</strong><span>{row.lead_title || row.organization_name || 'General follow-up'}</span></div><Badge tone={tone}>{row.status.replaceAll('_', ' ')}</Badge></header>
      {row.description ? <p>{row.description}</p> : null}
      {row.outcome ? <p className={styles.followupOutcome}><b>Outcome:</b> {row.outcome}</p> : null}
      <div className={styles.followupMeta}><span><b>When</b>{fmtDateTime(row.scheduled_at || row.next_follow_up_at)}</span><span><b>Contact</b>{contact}</span><span><b>Owner</b>{owner}</span><span><b>Type</b>{row.activity_type.replaceAll('_', ' ')}</span></div>
    </div>
    <div className={styles.followupActions}>
      {href ? <Link href={href} className={styles.openLeadLink}>Open Lead ↗</Link> : null}
      {active ? <><Button size="sm" onClick={() => void onChange(row, 'COMPLETED')}>Complete</Button><Button size="sm" variant="outline" onClick={onReschedule}>Reschedule</Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Cancel this follow-up? The record will remain in history.')) void onChange(row, 'CANCELLED'); }}>Cancel</Button></> : null}
    </div>
  </article>;
}

function RescheduleModal({ row, close, save }: { row: Activity; close: () => void; save: (value: string) => Promise<boolean> }) {
  const current = row.scheduled_at ? toLocalInput(row.scheduled_at) : '';
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <Modal open onClose={close} title="Reschedule follow-up"><form className={`stack ${styles.rescheduleForm}`} onSubmit={async (event) => { event.preventDefault(); if (!value) return; setSaving(true); setError(null); try { const saved = await save(new Date(value).toISOString()); if (!saved) setError('The follow-up could not be rescheduled. Review the page message and try again.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to reschedule follow-up.'); } finally { setSaving(false); } }}><div className={styles.rescheduleNote}><span className="eyebrow">{row.lead_title || row.organization_name || 'Follow-up'}</span><strong>{row.title}</strong><p>Choose a new date and time. Keep the commitment specific so it can be acted on.</p></div>{error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}<Input label="New date & time *" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} required/><div className={styles.modalActions}><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Save schedule</Button></div></form></Modal>;
}

function toLocalInput(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); }
function sortTime(a: Activity, b: Activity, active: Filter) {
  const timeA = new Date(a.scheduled_at || a.next_follow_up_at || a.completed_at || a.created_at).getTime();
  const timeB = new Date(b.scheduled_at || b.next_follow_up_at || b.completed_at || b.created_at).getTime();
  return active === 'COMPLETED' || active === 'CANCELLED' ? timeB - timeA : timeA - timeB;
}
function bucket(row: Activity, now: number): Exclude<Filter, 'ALL'> {
  if (row.status === 'COMPLETED') return 'COMPLETED';
  if (row.status === 'CANCELLED') return 'CANCELLED';
  const value = row.scheduled_at || row.next_follow_up_at;
  if (!value) return 'UPCOMING';
  const when = new Date(value).getTime();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  if (when < start.getTime()) return 'OVERDUE';
  if (when < end.getTime()) return 'TODAY';
  return 'UPCOMING';
}
function groupRows(rows: Activity[], now: number): Record<Exclude<Filter, 'ALL'>, Activity[]> {
  const groups: Record<Exclude<Filter, 'ALL'>, Activity[]> = { OVERDUE: [], TODAY: [], UPCOMING: [], COMPLETED: [], CANCELLED: [] };
  for (const row of rows) groups[bucket(row, now)].push(row);
  for (const [name, group] of Object.entries(groups) as Array<[Exclude<Filter, 'ALL'>, Activity[]]>) group.sort((a, b) => sortTime(a, b, name));
  return groups;
}
function groupTimeline(rows: Activity[], now: number) {
  const map = new Map<string, { key: string; label: string; order: number; rows: Activity[] }>();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const today = dayStart.getTime();
  for (const row of rows.slice().sort((a, b) => sortTime(a, b, 'ALL'))) {
    const value = row.scheduled_at || row.next_follow_up_at || row.completed_at || row.created_at;
    const date = value ? new Date(value) : null;
    const dateStart = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() : -1;
    const key = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'unscheduled';
    const label = !date ? 'No date recorded' : dateStart === today ? 'Today' : dateStart === today - 86400000 ? 'Yesterday' : new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    const current = map.get(key) ?? { key, label, order: date?.getTime() ?? -1, rows: [] };
    current.rows.push(row); map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.order - a.order);
}
