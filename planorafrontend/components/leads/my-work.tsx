'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import { getMyWork } from '@/lib/leads/api';
import { formatDate } from '@/lib/leads/helpers';
import type { MyWork } from '@/lib/leads/types';
import { LeadPriorityPill, LeadStagePill } from './lead-status';

export function MyWorkView() {
  const [data, setData] = useState<MyWork | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMyWork().then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load your work.'));
  }, []);

  if (error) return <AppShell area="staff" title="My Work" breadcrumb="My Work"><PageErrorState message={error} /></AppShell>;
  if (!data) return <AppShell area="staff" title="My Work" breadcrumb="My Work"><PageLoadingState /></AppShell>;

  return (
    <AppShell area="staff" title="My Work" breadcrumb="My Work" description="Your assigned Lead pursuits, tasks and follow-up workload." actions={<Link href="/my-work/lead-pool"><Button variant="outline">Browse Lead Pool</Button></Link>}>
      <div className="page-stack my-work-page">
        <div className="metric-grid">
          <MetricCard label="Assigned Leads" value={String(data.metrics.assigned_leads)} />
          <MetricCard label="Active pursuits" value={String(data.metrics.active_pursuits)} />
          <MetricCard label="Tasks today" value={String(data.metrics.tasks_due_today)} />
          <MetricCard label="Overdue Tasks" value={String(data.metrics.overdue_tasks)} />
          <MetricCard label="Follow-ups today" value={String(data.metrics.follow_ups_today)} />
          <MetricCard label="Overdue follow-ups" value={String(data.metrics.overdue_follow_ups)} />
        </div>

        <Card className="workspace-card my-work-card">
          <header><div><span className="eyebrow">Lead ownership</span><h2>Assigned Leads</h2><p>Open a Lead to continue its workflow, record contact activity and progress the pursuit.</p></div><Link href="/my-work/lead-pool"><Button size="sm" variant="outline">Pick from Lead Pool</Button></Link></header>
          {data.leads.length ? (
            <>
              <div className="my-work-desktop-table"><div className="table-wrap"><table className="data-table"><thead><tr><th>Organization</th><th>Priority</th><th>Stage</th><th>Assignment source</th><th>Progress</th><th>Next follow-up</th><th /></tr></thead><tbody>{data.leads.map((lead) => (
                <tr key={lead.id}>
                  <td><strong>{lead.organization_name}</strong><small className="ui-help my-work-subtext">{lead.industry || 'Organization Lead'}</small></td>
                  <td><LeadPriorityPill priority={lead.priority} /></td>
                  <td><LeadStagePill stage={lead.stage} /></td>
                  <td>{lead.claimed_by_id ? <span className="lead-route-badge pool-claim">Self-selected · Lead Pool</span> : lead.assigned_team_id ? 'Team assignment' : 'Admin assigned'}</td>
                  <td>{lead.pursuit_progress}%</td>
                  <td>{lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : '—'}</td>
                  <td><Link className="table-link" href={`/my-work/leads/${lead.id}`}>Open →</Link></td>
                </tr>
              ))}</tbody></table></div></div>
              <div className="my-work-mobile-list">{data.leads.map((lead) => (
                <article className="my-work-lead-card" key={lead.id}>
                  <header><div><strong>{lead.organization_name}</strong><span>{lead.pursuit_progress}% pursuit progress</span></div><LeadPriorityPill priority={lead.priority} /></header>
                  <div className="my-work-stage"><LeadStagePill stage={lead.stage} />{lead.claimed_by_id ? <span className="lead-route-badge pool-claim">Lead Pool</span> : null}</div>
                  <dl><div><dt>Next follow-up</dt><dd>{lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : '—'}</dd></div><div><dt>Deadline</dt><dd>{lead.current_assignment_due_at ? formatDate(lead.current_assignment_due_at) : '—'}</dd></div></dl>
                  <Link href={`/my-work/leads/${lead.id}`}><Button variant="outline">Open Lead</Button></Link>
                </article>
              ))}</div>
            </>
          ) : (
            <EmptyState icon="leads" title="No assigned Leads" description="Admin assignments and Leads you select from the shared Lead Pool will appear here." action={<Link href="/my-work/lead-pool"><Button variant="outline">Browse Lead Pool</Button></Link>} />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
