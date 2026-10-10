'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getStaffHome, type StaffHome } from '@/lib/delivery/api';
import styles from '@/components/staff/staff-polish.module.css';

const fmt = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const pretty = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
const isOverdue = (value: string | null) => Boolean(value && new Date(value).getTime() < Date.now());

export function StaffHomeView() {
  const [data, setData] = useState<StaffHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getStaffHome()
      .then((response) => active && setData(response))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : 'Unable to load My Day.'));
    return () => { active = false; };
  }, []);

  if (error) return <AppShell area="staff" title="My Day" breadcrumb="Home"><Card><div className="ui-card-content">{error}</div></Card></AppShell>;
  if (!data) return <AppShell area="staff" title="My Day" breadcrumb="Home"><Skeleton height={480} /></AppShell>;

  const metrics = [
    { label: 'Open Tasks', value: data.summary.open_tasks, note: 'Work currently in your queue', danger: false },
    { label: 'Overdue', value: data.summary.overdue_tasks, note: data.summary.overdue_tasks ? 'Needs attention now' : 'Nothing is overdue', danger: data.summary.overdue_tasks > 0 },
    { label: 'Assigned Leads', value: data.summary.assigned_leads, note: 'Organizations you own', danger: false },
    { label: 'Follow-ups Today', value: data.summary.followups_today, note: 'Scheduled customer actions', danger: false },
  ];

  return (
    <AppShell area="staff" title="My Day" breadcrumb="Home" personalize="greeting" description="Your assigned work, deadlines and customer follow-ups in one place.">
      <div className={styles.staffPage}>
        <div className={styles.kpiGrid}>
          {metrics.map((metric) => (
            <Card key={metric.label} className={`${styles.kpi} ${metric.danger ? styles.kpiDanger : ''}`}>
              <div className={styles.kpiTop}>
                <span className={styles.kpiLabel}>{metric.label}</span>
                {metric.danger ? <span className={styles.kpiFlag}>Attention</span> : null}
              </div>
              <strong className={styles.kpiValue}>{metric.value}</strong>
              <span className={styles.kpiNote}>{metric.note}</span>
            </Card>
          ))}
        </div>

        <div className={styles.focusBar}>
          <div className={styles.focusBarText}>
            <strong>{data.summary.overdue_tasks ? `${data.summary.overdue_tasks} overdue task${data.summary.overdue_tasks === 1 ? '' : 's'} need attention.` : 'Your task queue is clear of overdue work.'}</strong>
            <span>{data.summary.followups_today ? `${data.summary.followups_today} follow-up${data.summary.followups_today === 1 ? '' : 's'} scheduled for today.` : 'No follow-ups are scheduled for today.'}</span>
          </div>
          <Link className={styles.sectionLink} href={data.summary.overdue_tasks ? '/tasks' : '/follow-ups'}>
            {data.summary.overdue_tasks ? 'Open tasks →' : 'View follow-ups →'}
          </Link>
        </div>

        <div className={styles.queueGrid}>
          <Card className={styles.queueCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className="eyebrow">Work queue</span>
                <h2>My Tasks</h2>
                <p>Start with the work that has a deadline or high priority.</p>
              </div>
              <Link className={styles.sectionLink} href="/tasks">View all</Link>
            </div>
            <div className={styles.queueList}>
              {data.tasks.length ? data.tasks.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className={styles.taskRow}>
                  <div className={styles.taskMain}>
                    <strong className={styles.taskTitle}>{task.title}</strong>
                    <div className={styles.taskMeta}>
                      <span>{pretty(task.status)}</span>
                      <span className={styles.taskMetaDot}>{task.due_at ? (isOverdue(task.due_at) ? 'Overdue' : `Due ${fmt(task.due_at)}`) : 'No deadline'}</span>
                    </div>
                  </div>
                  <div className={styles.taskRight}>
                    {task.due_at ? <span className={isOverdue(task.due_at) ? styles.dueOverdue : styles.due}>{isOverdue(task.due_at) ? 'Overdue' : fmt(task.due_at)}</span> : null}
                    <Badge tone={task.priority === 'HIGH' || task.priority === 'URGENT' ? 'warning' : 'neutral'}>{task.priority}</Badge>
                  </div>
                </Link>
              )) : <p className={styles.emptyHint}>No open tasks. New assigned work will appear here.</p>}
            </div>
          </Card>

          <Card className={styles.queueCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className="eyebrow">Pipeline</span>
                <h2>My Leads</h2>
                <p>Continue the next action on organizations assigned to you.</p>
              </div>
              <Link className={styles.sectionLink} href="/my-work">Open leads</Link>
            </div>
            <div className={styles.queueList}>
              {data.leads.length ? data.leads.map((lead) => (
                <Link key={lead.id} href={`/my-work/leads/${lead.id}`} className={styles.leadRow}>
                  <div className={styles.leadMain}>
                    <strong className={styles.leadTitle}>{lead.organization_name}</strong>
                    <div className={styles.leadMeta}>
                      <span>{pretty(lead.stage)}</span>
                      
                    </div>
                  </div>
                  <div className={styles.leadRight}>
                    <div className={styles.leadProgress}>
                      <div className={styles.progressTop}><span>Pursuit</span><strong>{lead.pursuit_progress}%</strong></div>
                      <div className={styles.progressTrack}><span className={styles.progressBar} style={{ width: `${Math.max(0, Math.min(100, lead.pursuit_progress))}%` }} /></div>
                    </div>
                    <Badge tone={lead.priority === 'HIGH' || lead.priority === 'URGENT' ? 'warning' : 'neutral'}>{lead.priority}</Badge>
                  </div>
                </Link>
              )) : <p className={styles.emptyHint}>No Leads are assigned to you yet.</p>}
            </div>
          </Card>
        </div>

        <Card className={styles.queueCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className="eyebrow">Next actions</span>
              <h2>Upcoming Follow-ups</h2>
              <p>Stay ahead of the conversations you have already committed to.</p>
            </div>
            <Link className={styles.sectionLink} href="/follow-ups">See all</Link>
          </div>
          <div className={styles.followupList}>
            {data.followups.length ? data.followups.map((followup) => (
              <div key={followup.id} className={styles.followupRow}>
                <div className={styles.followupMain}>
                  <strong className={styles.followupTitle}>{followup.title}</strong>
                  <span className={styles.followupOrg}>{followup.organization_name || 'General follow-up'}</span>
                </div>
                <time className={styles.followupTime} dateTime={followup.scheduled_at}>{fmt(followup.scheduled_at)}</time>
              </div>
            )) : <p className={styles.emptyHint}>No upcoming follow-ups. Schedule the next action after your next customer interaction.</p>}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
