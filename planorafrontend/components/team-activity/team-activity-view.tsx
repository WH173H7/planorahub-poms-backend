'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import { listTasks } from '@/lib/leads/api';
import type { TaskDetail } from '@/lib/leads/types';
import {
  listTeamActivity,
  setTeamActivityReviewed,
  type TeamActivityData,
  type TeamActivityItem,
} from '@/lib/team-activity/api';

export const teamActivityLabels: Record<string, string> = {
  ACTIVITY_CREATED: 'Activity logged',
  FOLLOW_UP_SCHEDULED: 'Follow-up scheduled',
  FOLLOW_UP_COMPLETED: 'Follow-up completed',
  FOLLOW_UP_CANCELLED: 'Follow-up cancelled',
  FOLLOW_UP_RESCHEDULED: 'Follow-up rescheduled',
  TASK_CREATED: 'Task created',
  TASK_WORKFLOW_UPDATED: 'Task updated',
  TASK_ACCEPTED: 'Task accepted',
  TASK_STARTED: 'Task started',
  TASK_ATTACHMENT_UPLOADED: 'Task file uploaded',
  TASK_SUBMITTED_FOR_REVIEW: 'Task submitted for review',
  TASK_APPROVED: 'Task approved',
  TASK_REVISION_REQUESTED: 'Task revision requested',
  LEAD_ASSIGNED: 'Lead assigned',
  LEAD_REASSIGNED: 'Lead reassigned',
  LEAD_ASSIGNMENT_BATCH_CREATED: 'Lead batch assigned',
  LEAD_PURSUIT_STEP_COMPLETED: 'Pursuit step completed',
  LEAD_PURSUIT_EVIDENCE_UPLOADED: 'Pursuit evidence uploaded',
  LEAD_PURSUIT_STAFF_STEP_ADDED: 'Staff pursuit step added',
  LEAD_PURSUIT_ADMIN_STEP_ADDED: 'Required pursuit step added',
  LEAD_PURSUIT_RETAKE_REQUESTED: 'Pursuit retake requested',
  LEAD_PURSUIT_COMMENT_ADDED: 'Pursuit feedback added',
};

type Period = 'ALL' | 'TODAY' | '7D' | '30D' | 'CUSTOM';

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function teamActivityActor(item: TeamActivityItem) {
  return [item.actor_first_name, item.actor_last_name].filter(Boolean).join(' ') || item.actor_email || 'System';
}

export function teamActivityDetail(item: TeamActivityItem) {
  const value = item.new_values ?? {};
  if (item.action === 'LEAD_PURSUIT_STEP_COMPLETED') return typeof value.title === 'string' ? `Completed ${value.title}` : 'Completed a pursuit step';
  if (item.action === 'LEAD_PURSUIT_EVIDENCE_UPLOADED') return typeof value.fileName === 'string' ? `Uploaded ${value.fileName}` : 'Uploaded pursuit evidence';
  if (item.action === 'LEAD_REASSIGNED') return 'Changed Lead ownership';
  if (item.action === 'LEAD_ASSIGNMENT_BATCH_CREATED') return typeof value.title === 'string' ? value.title : 'Created a Lead assignment batch';
  if (item.action === 'TASK_WORKFLOW_UPDATED') {
    const oldStatus = typeof item.old_values?.status === 'string' ? item.old_values.status : null;
    const newStatus = typeof item.new_values?.status === 'string' ? item.new_values.status : null;
    if (oldStatus !== 'COMPLETED' && newStatus === 'COMPLETED') return `Completed ${item.task_title ?? 'task'}`;
    if (oldStatus === 'COMPLETED' && newStatus !== 'COMPLETED') return `Reopened ${item.task_title ?? 'task'}`;
  }
  return item.task_title ?? item.activity_title ?? item.lead_title ?? teamActivityLabels[item.action] ?? item.action.replaceAll('_', ' ').toLowerCase();
}

export function teamActivityDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

const styles = {
  page: { display: 'grid', gap: 18 } as const,
  controls: { padding: 18, display: 'grid', gap: 16 },
  controlRow: { display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' as const },
  controlGroup: { display: 'grid', gap: 7 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: '#766c79' },
  segment: { display: 'flex', gap: 5, flexWrap: 'wrap' as const, padding: 4, border: '1px solid #e7e1e8', borderRadius: 12, background: '#faf8fb' },
  filterGrid: { display: 'grid', gridTemplateColumns: '1.2fr .9fr 1fr 1.15fr 1.15fr', gap: 12, alignItems: 'end' },
  feed: { padding: 0, overflow: 'hidden' },
  row: { display: 'grid', gridTemplateColumns: '42px minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: '18px 20px' },
  icon: { width: 38, height: 38, borderRadius: 12, background: '#f6f1f7', color: '#6F2C7F', display: 'grid', placeItems: 'center' },
  line: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  meta: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 7, fontSize: 12, color: '#847a87' },
  actions: { display: 'flex', alignItems: 'center', gap: 8 },
};

export function TeamActivityView() {
  const [data, setData] = useState<TeamActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [staffId, setStaffId] = useState('');
  const [type, setType] = useState('');
  const [leadId, setLeadId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [reviewed, setReviewed] = useState('false');
  const [period, setPeriod] = useState<Period>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [overdueTasks, setOverdueTasks] = useState<TaskDetail[]>([]);
  const [allTasks, setAllTasks] = useState<TaskDetail[]>([]);
  const [workView,setWorkView]=useState<'REVIEWED'|'UNREVIEWED'|'OVERDUE'>('UNREVIEWED');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    listTasks(false).then((tasks) => {
      if (!active) return;
      const now = Date.now();
      setAllTasks(tasks);
      setOverdueTasks(tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && Boolean(task.due_at) && new Date(task.due_at as string).getTime() < now));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const effectiveDates = useMemo(() => {
    if (period === 'TODAY') return { from: localDate(), to: localDate() };
    if (period === '7D') return { from: localDate(-6), to: localDate() };
    if (period === '30D') return { from: localDate(-29), to: localDate() };
    if (period === 'CUSTOM') return { from, to };
    return { from: '', to: '' };
  }, [period, from, to]);

  const query = useMemo(() => ({
    search: debouncedSearch,
    staffId,
    type,
    leadId,
    organizationId,
    reviewed,
    from: effectiveDates.from,
    to: effectiveDates.to,
  }), [debouncedSearch, staffId, type, leadId, organizationId, reviewed, effectiveDates.from, effectiveDates.to]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const value = await listTeamActivity(query);
      setData(value);
      setError(null);
      return value;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load team activity.');
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    listTeamActivity(query)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Unable to load team activity.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  if (loading && !data) return <PageLoadingState />;
  if (error && !data) return <PageErrorState message={error} />;

  const items = data?.items ?? [];

  async function toggleReviewed(item: TeamActivityItem) {
    setUpdatingId(item.id);
    setData((current) => current ? {
      ...current,
      items: current.items.map((entry) => entry.id === item.id ? { ...entry, reviewed: !item.reviewed } : entry),
    } : current);
    try {
      await setTeamActivityReviewed(item.id, !item.reviewed);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update review status.');
      await refresh();
    } finally {
      setUpdatingId(null);
    }
  }

  const periodOptions: Array<[Period, string]> = [
    ['ALL', 'All'], ['TODAY', 'Today'], ['7D', '7 days'], ['30D', '30 days'], ['CUSTOM', 'Custom'],
  ];

  const workTasks=overdueTasks;
  const changeWorkView=(next:'REVIEWED'|'UNREVIEWED'|'OVERDUE')=>{setWorkView(next);if(next==='REVIEWED')setReviewed('true');else if(next==='UNREVIEWED')setReviewed('false');else setReviewed('');};

  return (
    <div style={styles.page}>
      <Card style={styles.controls}>
        <div style={styles.controlRow}>
          <div style={styles.controlGroup}>
            <span style={styles.label}>Period</span>
            <div style={styles.segment}>
              {periodOptions.map(([value, label]) => (
                <Button key={value} type="button" size="sm" variant={period === value ? 'secondary' : 'ghost'} onClick={() => setPeriod(value)}>{label}</Button>
              ))}
            </div>
          </div>
          <div style={styles.controlGroup}>
            <span style={styles.label}>Review status</span>
            <div style={styles.segment}>
              {([['UNREVIEWED','Unreviewed'],['REVIEWED','Reviewed'],['OVERDUE',`Overdue (${overdueTasks.length})`]] as const).map(([v,l])=><Button key={v} type="button" size="sm" variant={workView===v?'secondary':'ghost'} onClick={()=>changeWorkView(v)}>{l}</Button>)}
            </div>
          </div>
        </div>

        <div style={styles.filterGrid}>
          <Input label="Search" placeholder="Staff, action, notes…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <NativeSelect label="Staff" value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            <option value="">All staff</option>
            {(data?.staff ?? []).map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}
          </NativeSelect>
          <NativeSelect label="Type" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">All activity types</option>
            {(data?.types ?? []).map((value) => <option key={value} value={value}>{teamActivityLabels[value] ?? value}</option>)}
          </NativeSelect>
          <NativeSelect label="Lead" value={leadId} onChange={(event) => setLeadId(event.target.value)}>
            <option value="">All Leads</option>
            {(data?.leads ?? []).map((lead) => <option key={lead.id} value={lead.id}>{lead.title}</option>)}
          </NativeSelect>
          <NativeSelect label="Organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            <option value="">All organizations</option>
            {(data?.organizations ?? []).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </NativeSelect>
          {period === 'CUSTOM' ? <>
            <Input label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <Input label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </> : null}
        </div>
        {refreshing ? <span className="muted" style={{ fontSize: 12 }}>Updating activity…</span> : null}
      </Card>

      {error ? <p className="muted">Latest refresh failed: {error}</p> : null}

      {workView==='OVERDUE'?<Card style={{padding:18,borderLeft:workTasks.length?'4px solid #b42318':undefined}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div><strong>Overdue delivery</strong><div className="ui-help">Tasks past deadline and not yet completed. Open a task to review the responsible staff member and delivery history.</div></div><strong>{workTasks.length}</strong></div>{workTasks.length?<div>{workTasks.slice(0,12).map(t=><Link key={t.id} href={`/tasks/${t.id}`} style={{display:'grid',gridTemplateColumns:'1fr auto',padding:'12px 0',borderTop:'1px solid #eee',textDecoration:'none',color:'inherit'}}><span><strong>{t.title}</strong><small className="ui-help" style={{display:'block'}}>{[t.assignee_first_name,t.assignee_last_name].filter(Boolean).join(' ')||'Unassigned'} · {t.organization_name||t.lead_title||'General'}</small></span><span className="ui-help">Due {t.due_at?teamActivityDateTime(t.due_at):'—'}</span></Link>)}</div>:<div className="ui-help">No overdue tasks right now.</div>}</Card>:null}

      {workView!=='OVERDUE'?<><h2 style={{margin:'2px 0 -6px'}}>{workView==='REVIEWED'?'Reviewed team activity':'Unreviewed team activity'}</h2>
      <Card style={styles.feed}>
        {items.length ? <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item, index) => (
            <li key={item.id} style={{ borderTop: index ? '1px solid #eee8f0' : undefined, background: item.reviewed ? '#fff' : '#fdfbfe' }}>
              <div style={styles.row}>
                <span style={styles.icon}><Icon name="activity" /></span>
                <Link href={`/team-activity/${item.id}`} style={{ minWidth: 0, opacity: item.reviewed ? .72 : 1, color: 'inherit', textDecoration: 'none' }}>
                  <div style={styles.line}>
                    <strong style={{ color: '#28102F' }}>{teamActivityActor(item)}</strong>
                    <span style={{ fontWeight: 600 }}>{teamActivityLabels[item.action] ?? item.action}</span>
                    <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: item.reviewed ? '#f1f1f2' : '#ede0f1', color: item.reviewed ? '#6b6570' : '#6F2C7F' }}>{item.reviewed ? 'Reviewed' : 'New'}</span>
                  </div>
                  <p style={{ margin: '5px 0 0', color: '#4f4652' }}>{teamActivityDetail(item)}</p>
                  <div style={styles.meta}>
                    {item.organization_name ? <span>{item.organization_name}</span> : null}
                    {item.lead_title ? <span>· {item.lead_title}</span> : null}
                    <time style={{ marginLeft: 'auto' }}>{teamActivityDateTime(item.created_at)}</time>
                  </div>
                </Link>
                <div style={styles.actions}>
                  <Button size="sm" variant="outline" loading={updatingId === item.id} onClick={() => void toggleReviewed(item)}>{item.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}</Button>
                  <Link href={`/team-activity/${item.id}`} aria-label="Open activity details" style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, color: '#6F2C7F', textDecoration: 'none' }}><Icon name="chevron" /></Link>
                </div>
              </div>
            </li>
          ))}
        </ol> : <EmptyState icon="activity" title="No matching team activity" description="Try clearing one or more filters." />}
      </Card></>:null}
    </div>
  );
}
