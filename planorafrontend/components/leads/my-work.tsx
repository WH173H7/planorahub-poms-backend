'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import { getMyWork } from '@/lib/leads/api';
import { formatDate } from '@/lib/leads/helpers';
import type { MyWork } from '@/lib/leads/types';
import { LeadPriorityPill, LeadStagePill } from './lead-status';
import styles from '@/components/staff/staff-polish.module.css';

export function MyWorkView() {
  const [data, setData] = useState<MyWork | null>(null);
  const [now] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMyWork().then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load your work.'));
  }, []);

  if (error) return <AppShell area="staff" title="My Work" breadcrumb="My Work"><PageErrorState message={error} /></AppShell>;
  if (!data) return <AppShell area="staff" title="My Work" breadcrumb="My Work"><PageLoadingState /></AppShell>;

  const metrics = [
    { label: 'Assigned Leads', value: data.metrics.assigned_leads, note: 'Organizations in your queue', danger: false },
    { label: 'Active pursuits', value: data.metrics.active_pursuits, note: 'Pursuits currently moving', danger: false },
    { label: 'Tasks today', value: data.metrics.tasks_due_today, note: 'Due before the day ends', danger: false },
    { label: 'Overdue tasks', value: data.metrics.overdue_tasks, note: data.metrics.overdue_tasks ? 'Requires attention' : 'Nothing overdue', danger: data.metrics.overdue_tasks > 0 },
    { label: 'Follow-ups today', value: data.metrics.follow_ups_today, note: 'Customer actions scheduled', danger: false },
    { label: 'Overdue follow-ups', value: data.metrics.overdue_follow_ups, note: data.metrics.overdue_follow_ups ? 'Bring these current' : 'Nothing overdue', danger: data.metrics.overdue_follow_ups > 0 },
  ];

  return (
    <AppShell area="staff" title="My Work" breadcrumb="My Work" description="Your assigned Leads, pursuit progress, tasks and follow-up workload." actions={<Link href="/my-work/lead-pool"><Button variant="outline">Browse Lead Pool</Button></Link>}>
      <div className={styles.myWork}>
        <div className={styles.myWorkMetrics}>
          {metrics.map((metric) => (
            <Card key={metric.label} className={`${styles.myWorkMetric} ${metric.danger ? styles.myWorkMetricDanger : ''}`}>
              <span className={styles.myWorkMetricLabel}>{metric.label}</span>
              <strong className={styles.myWorkMetricValue}>{metric.value}</strong>
              <span className={styles.myWorkMetricNote}>{metric.note}</span>
            </Card>
          ))}
        </div>

        <Card className={styles.myWorkCard}>
          <header className={styles.myWorkHeader}>
            <div>
              <span className="eyebrow">Lead ownership</span>
              <h2>Assigned Leads</h2>
              <p>Open a Lead to continue its workflow, record contact activity and complete the next required action.</p>
            </div>
            <div className={styles.myWorkHeaderAction}>
              <Link href="/my-work/lead-pool"><Button size="sm" variant="outline">Pick from Lead Pool</Button></Link>
            </div>
          </header>

          {data.leads.length ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.myWorkTable}>
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>Priority</th>
                      <th>Stage</th>
                      <th>Assignment</th>
                      <th>Pursuit</th>
                      <th>Next action</th>
                      <th>Due</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.leads.map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          <div className={styles.orgCell}>
                            <strong className={styles.orgName}>{lead.organization_name}</strong>
                            <span className={styles.orgMeta}>{lead.industry || 'Organization Lead'}</span>
                          </div>
                        </td>
                        <td><LeadPriorityPill priority={lead.priority} /></td>
                        <td><LeadStagePill stage={lead.stage} /></td>
                        <td>
                          <div className={styles.assignmentCell}>
                            <span className={styles.assignmentSource}>{lead.claimed_by_id ? 'Lead Pool · self-selected' : lead.assigned_team_id ? `Team · ${lead.assigned_team_name || 'Assigned team'}` : 'Admin assigned'}</span>
                            {lead.current_assignment_title ? <span className={styles.assignmentTitle}>{lead.current_assignment_title}</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className={styles.progressCell}>
                            <div className={styles.progressTop}><span>Pursuit</span><strong>{lead.pursuit_progress}%</strong></div>
                            <div className={styles.progressTrack}><span className={styles.progressBar} style={{ width: `${Math.max(0, Math.min(100, lead.pursuit_progress))}%` }} /></div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.nextAction}>
                            <strong title={lead.next_action || undefined}>{lead.next_action || 'No next action recorded'}</strong>
                            <span>{lead.next_follow_up_at ? `Follow-up · ${formatDate(lead.next_follow_up_at)}` : 'No follow-up scheduled'}</span>
                          </div>
                        </td>
                        <td>
                          <span className={lead.current_assignment_due_at && new Date(lead.current_assignment_due_at).getTime() < now ? styles.dueOverdue : styles.due}>
                            {lead.current_assignment_due_at ? formatDate(lead.current_assignment_due_at) : '—'}
                          </span>
                        </td>
                        <td><Link className={styles.openLink} href={`/my-work/leads/${lead.id}`}>Open →</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.mobileList}>
                {data.leads.map((lead) => (
                  <article className={styles.mobileLeadCard} key={lead.id}>
                    <div className={styles.mobileLeadHead}>
                      <div className={styles.mobileLeadIdentity}>
                        <strong>{lead.organization_name}</strong>
                        <span>{lead.industry || 'Organization Lead'}</span>
                      </div>
                      <LeadPriorityPill priority={lead.priority} />
                    </div>

                    <div className={styles.mobileLeadStatus}>
                      <LeadStagePill stage={lead.stage} />
                      {lead.claimed_by_id ? <Badge tone="purple">Lead Pool</Badge> : null}
                    </div>

                    <div className={styles.mobileLeadMeta}>
                      <div className={styles.mobileLeadMetaItem}>
                        <small>Pursuit progress</small>
                        <strong>{lead.pursuit_progress}%</strong>
                        <div className={styles.progressTrack}><span className={styles.progressBar} style={{ width: `${Math.max(0, Math.min(100, lead.pursuit_progress))}%` }} /></div>
                      </div>
                      <div className={styles.mobileLeadMetaItem}>
                        <small>Assignment</small>
                        <strong>{lead.current_assignment_title || (lead.claimed_by_id ? 'Lead Pool' : 'Assigned Lead')}</strong>
                        <span>{lead.assigned_team_id ? lead.assigned_team_name || 'Team' : lead.claimed_by_id ? 'Self-selected' : 'Admin assigned'}</span>
                      </div>
                      <div className={styles.mobileLeadMetaItem}>
                        <small>Next action</small>
                        <strong>{lead.next_action || 'No next action'}</strong>
                        <span>{lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : 'No follow-up scheduled'}</span>
                      </div>
                      <div className={styles.mobileLeadMetaItem}>
                        <small>Assignment due</small>
                        <strong className={lead.current_assignment_due_at && new Date(lead.current_assignment_due_at).getTime() < now ? styles.dueOverdue : ''}>{lead.current_assignment_due_at ? formatDate(lead.current_assignment_due_at) : 'No deadline'}</strong>
                      </div>
                    </div>

                    <Link className={styles.mobileOpen} href={`/my-work/leads/${lead.id}`}><Button variant="outline">Open Lead</Button></Link>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon="leads" title="No assigned Leads" description="Admin assignments and Leads you select from the shared Lead Pool will appear here." action={<Link href="/my-work/lead-pool"><Button variant="outline">Browse Lead Pool</Button></Link>} />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
