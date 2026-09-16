'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageErrorState } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getDashboard, type DashboardData } from '@/lib/delivery/api';

const fmt = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

const human = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

function activityHref(item: DashboardData['recent'][number]) {
  const id = item.entity_id;
  switch (item.entity_type) {
    case 'user':
      return id ? `/staff/${id}` : '/staff';
    case 'lead':
      return id ? `/leads/${id}` : '/leads';
    case 'task':
      return id ? `/tasks/${id}` : '/tasks';
    case 'organization':
      return id ? `/organizations/${id}` : '/organizations';
    case 'lead_assignment_batch':
      return id ? `/assignments/${id}` : '/leads';
    case 'activity':
      return '/follow-ups';
    case 'calendar_reminder':
      return '/calendar';
    case 'letter_document':
    case 'letterhead_settings':
      return '/letterhead';
    case 'task_workflow':
      return '/task-workflows';
    case 'lead_pursuit_workflow':
    case 'lead_pursuit_step':
    case 'lead_pursuit_evidence':
      return '/lead-workflows';
    case 'contact':
    case 'contact_method':
      return '/contacts';
    case 'communication_template':
      return '/templates';
    case 'gmail_message':
      return '/email';
    case 'direct_chat_message':
    case 'chat_channel':
      return '/internal-chat';
    default:
      return '/audit-logs';
  }
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDashboard()
      .then((response) => active && setData(response))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : 'Unable to load dashboard.'));
    return () => {
      active = false;
    };
  }, []);

  const pipeline = useMemo(() => {
    if (!data) return { total: 0, leadEnd: 0, prospectEnd: 0 };
    const total = Math.max(1, data.kpi.total_leads + data.kpi.prospects + data.kpi.clients);
    const leadEnd = Math.round((data.kpi.total_leads / total) * 100);
    const prospectEnd = Math.round(((data.kpi.total_leads + data.kpi.prospects) / total) * 100);
    return {
      total: data.kpi.total_leads + data.kpi.prospects + data.kpi.clients,
      leadEnd,
      prospectEnd,
    };
  }, [data]);

  if (error) {
    return (
      <AppShell area="admin" title="Dashboard" breadcrumb="Overview">
        <PageErrorState message={error} />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell area="admin" title="Dashboard" breadcrumb="Overview">
        <Skeleton height={500} />
      </AppShell>
    );
  }

  const kpi = data.kpi;
  const kpis = [
    ['Total Leads', kpi.total_leads, '/leads', 'Open lead pool'],
    ['Active Pursuit', kpi.active_pursuits, '/leads', 'Open pursuits'],
    ['Prospects', kpi.prospects, '/prospects', 'Open prospects'],
    ['Clients', kpi.clients, '/clients', 'Open clients'],
    ['Overdue Tasks', kpi.overdue_tasks, '/tasks', 'Review tasks'],
    ['Follow-ups Today', kpi.followups_today, '/follow-ups', 'Open follow-ups'],
  ] as const;

  const health = [
    ['Active pursuits', kpi.active_pursuits, '/leads', 'Keep pursuit work moving'],
    ['Overdue tasks', kpi.overdue_tasks, '/tasks', 'Review delivery risk'],
    ['Follow-ups today', kpi.followups_today, '/follow-ups', 'Open today’s schedule'],
    ['Ready for review', kpi.ready_for_review, '/leads', 'Review prospect recommendations'],
  ] as const;

  const pipelineRows = [
    ['Leads', kpi.total_leads, '#6F2C7F', '/leads'],
    ['Prospects', kpi.prospects, '#A66AB4', '/prospects'],
    ['Clients', kpi.clients, '#d9c5de', '/clients'],
  ] as const;

  return (
    <AppShell
      area="admin"
      title="Dashboard"
      breadcrumb="Overview"
      personalize="welcome"
      description="Live operational view of PlanoraHub work, pipeline and delivery health."
      actions={
        <Link className="ui-button ui-button--outline ui-button--md" href="/analytics">
          Open analytics
        </Link>
      }
    >
      <div className="page-stack dashboard-page">
        <section className="dashboard-kpis" aria-label="CRM summary">
          {kpis.map(([label, value, href, action]) => (
            <Link href={href} key={label} className="ui-card dashboard-kpi dashboard-kpi-link">
              <div className="dashboard-kpi-label">{label}</div>
              <div className="dashboard-kpi-value">{value}</div>
              <span className="dashboard-kpi-link-label">{action} →</span>
            </Link>
          ))}
        </section>

        <section className="dashboard-grid">
          <Card>
            <div className="ui-card-content">
              <div className="dashboard-card-heading">
                <div>
                  <span className="eyebrow">Pipeline</span>
                  <h2>CRM pipeline distribution</h2>
                  <p className="ui-help">Select a lifecycle stage to open its working list.</p>
                </div>
                <Link href="/analytics" className="dashboard-text-link">View report</Link>
              </div>

              <div className="dashboard-pipeline-layout">
                <Link
                  href="/analytics"
                  className="dashboard-donut-link"
                  aria-label={`Open analytics for ${pipeline.total} CRM records`}
                >
                  <div
                    className="dashboard-donut"
                    style={{
                      background: `conic-gradient(#6F2C7F 0 ${pipeline.leadEnd}%, #A66AB4 ${pipeline.leadEnd}% ${pipeline.prospectEnd}%, #d9c5de ${pipeline.prospectEnd}% 100%)`,
                    }}
                  >
                    <div className="dashboard-donut-center">
                      <span>
                        <strong>{pipeline.total}</strong>
                        <small className="ui-help">CRM records</small>
                      </span>
                    </div>
                  </div>
                </Link>

                <div className="dashboard-legend">
                  {pipelineRows.map(([name, value, color, href]) => (
                    <Link href={href} key={name} className="dashboard-legend-row dashboard-legend-link">
                      <span className="dashboard-legend-name">
                        <i style={{ background: color }} />
                        {name}
                      </span>
                      <span className="dashboard-legend-value">
                        <strong>{value}</strong>
                        <span aria-hidden="true">→</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="ui-card-content">
              <div className="dashboard-card-heading">
                <div>
                  <span className="eyebrow">Operations</span>
                  <h2>Delivery health</h2>
                  <p className="ui-help">Every indicator opens the workspace where action is required.</p>
                </div>
              </div>

              <div className="dashboard-health-grid">
                {health.map(([name, value, href, description]) => (
                  <Link href={href} key={name} className="dashboard-health-item dashboard-health-link">
                    <span className="dashboard-health-topline">
                      <strong>{value}</strong>
                      <span aria-hidden="true">→</span>
                    </span>
                    <span className="dashboard-health-name">{name}</span>
                    <small>{description}</small>
                  </Link>
                ))}
              </div>

              <div className="dashboard-subheading">
                <h3>Upcoming follow-ups</h3>
                <Link href="/follow-ups" className="dashboard-text-link">See all</Link>
              </div>

              {data.upcoming.length ? (
                data.upcoming.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    href={item.lead_id ? `/leads/${item.lead_id}` : '/follow-ups'}
                    className="dashboard-list-row dashboard-list-link"
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <div className="ui-help">{item.organization_name || 'General'}</div>
                    </div>
                    <span className="dashboard-row-side">
                      <time className="dashboard-row-time" dateTime={item.scheduled_at}>{fmt(item.scheduled_at)}</time>
                      <span aria-hidden="true" className="dashboard-row-arrow">→</span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="ui-help dashboard-empty-copy">No upcoming follow-ups.</p>
              )}
            </div>
          </Card>
        </section>

        <section className="dashboard-grid-equal">
          <Card>
            <div className="ui-card-content">
              <div className="dashboard-card-heading">
                <div>
                  <span className="eyebrow">People</span>
                  <h2>Staff delivery</h2>
                  <p className="ui-help">Open a staff profile or jump into the work behind each count.</p>
                </div>
                <Link href="/staff" className="dashboard-text-link">View staff</Link>
              </div>

              {data.staff.length ? (
                data.staff.map((staff) => (
                  <div key={staff.id} className="dashboard-list-row dashboard-staff-row">
                    <div className="dashboard-staff-person">
                      <Link href={`/staff/${staff.id}`} className="dashboard-staff-name">
                        {staff.first_name} {staff.last_name}
                      </Link>
                      <div className="dashboard-staff-links">
                        <Link href="/leads">{staff.assigned_leads} leads</Link>
                        <span>·</span>
                        <Link href="/tasks">{staff.assigned_tasks} tasks</Link>
                      </div>
                    </div>
                    <div className="dashboard-row-end">
                      <Link href="/tasks" className="dashboard-badge-link" aria-label={`Open tasks for ${staff.first_name} ${staff.last_name}`}>
                        <Badge tone={staff.overdue_tasks > 0 ? 'danger' : 'success'}>
                          {staff.overdue_tasks} overdue
                        </Badge>
                      </Link>
                      <Link href="/tasks" className="dashboard-completed-link">{staff.completed_tasks} completed</Link>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ui-help dashboard-empty-copy">No staff work yet.</p>
              )}
            </div>
          </Card>

          <Card className="dashboard-activity-card">
            <div className="ui-card-content">
              <div className="dashboard-card-heading dashboard-activity-heading">
                <div>
                  <span className="eyebrow">Audit</span>
                  <h2>Recent activity</h2>
                  <p className="ui-help">Latest actions across the CRM.</p>
                </div>
                <Link href="/audit-logs" className="dashboard-text-link">See all</Link>
              </div>

              {data.recent.length ? (
                <div className="dashboard-activity-list">
                  {data.recent.slice(0, 4).map((item) => (
                    <Link key={item.id} href={activityHref(item)} className="dashboard-activity-row">
                      <span className="dashboard-activity-dot" aria-hidden="true" />
                      <span className="dashboard-activity-copy">
                        <strong>{human(item.action)}</strong>
                        <small>
                          {[item.first_name, item.last_name].filter(Boolean).join(' ') || 'System'}
                          {' · '}
                          {fmt(item.created_at)}
                        </small>
                      </span>
                      <span className="dashboard-row-arrow" aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="ui-help dashboard-empty-copy">No recent activity.</p>
              )}

              <Link href="/audit-logs" className="dashboard-activity-footer">
                View all system activity <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
