'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getStaffHome, type StaffHome } from '@/lib/delivery/api';

const fmt = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const pretty = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

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
    ['Open Tasks', data.summary.open_tasks],
    ['Overdue', data.summary.overdue_tasks],
    ['Assigned Leads', data.summary.assigned_leads],
    ['Follow-ups Today', data.summary.followups_today],
  ] as const;

  return (
    <AppShell area="staff" title="My Day" breadcrumb="Home" personalize="greeting" description="Your assigned work, deadlines and customer follow-ups in one place.">
      <div className="page-stack staff-home-page">
        <div className="staff-home-kpis">
          {metrics.map(([label, value]) => (
            <Card key={label}><div className="staff-home-kpi"><span>{label}</span><strong>{value}</strong></div></Card>
          ))}
        </div>

        <div className="staff-home-grid">
          <Card>
            <div className="ui-card-content">
              <div className="dashboard-card-heading"><div><span className="eyebrow">Work queue</span><h2>My Tasks</h2></div><Link className="dashboard-text-link" href="/tasks">View all</Link></div>
              {data.tasks.length ? data.tasks.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className="staff-home-row">
                  <div><strong>{task.title}</strong><span>{pretty(task.status)} · {task.due_at ? fmt(task.due_at) : 'No deadline'}</span></div>
                  <Badge tone={task.priority === 'HIGH' || task.priority === 'URGENT' ? 'warning' : 'neutral'}>{task.priority}</Badge>
                </Link>
              )) : <p className="ui-help">No open tasks.</p>}
            </div>
          </Card>

          <Card>
            <div className="ui-card-content">
              <div className="dashboard-card-heading"><div><span className="eyebrow">Pipeline</span><h2>My Leads</h2></div><Link className="dashboard-text-link" href="/my-work">Open leads</Link></div>
              {data.leads.length ? data.leads.map((lead) => (
                <Link key={lead.id} href={`/my-work/leads/${lead.id}`} className="staff-home-row">
                  <div><strong>{lead.organization_name}</strong><span>{pretty(lead.stage)} · {lead.pursuit_progress}% pursuit</span></div>
                  <Badge tone={lead.priority === 'HIGH' || lead.priority === 'URGENT' ? 'warning' : 'neutral'}>{lead.priority}</Badge>
                </Link>
              )) : <p className="ui-help">No Leads assigned to you.</p>}
            </div>
          </Card>
        </div>

        <Card>
          <div className="ui-card-content">
            <div className="dashboard-card-heading"><div><span className="eyebrow">Next actions</span><h2>Upcoming Follow-ups</h2></div><Link className="dashboard-text-link" href="/follow-ups">See all</Link></div>
            {data.followups.length ? data.followups.map((followup) => (
              <div key={followup.id} className="dashboard-list-row">
                <div><strong>{followup.title}</strong><div className="ui-help">{followup.organization_name || 'General'}</div></div>
                <time className="dashboard-row-time" dateTime={followup.scheduled_at}>{fmt(followup.scheduled_at)}</time>
              </div>
            )) : <p className="ui-help">No upcoming follow-ups.</p>}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
