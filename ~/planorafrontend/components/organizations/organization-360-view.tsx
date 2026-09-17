'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageErrorState } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getOrganization360,
  setOrganizationStatus,
  type Organization360,
} from '@/lib/organizations/api';

import { OrganizationFormDialog } from './organization-form-dialog';

const fmt = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value))
    : '—';

export function Organization360View({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<Organization360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setError(null);
      setData(await getOrganization360(organizationId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Organization 360.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    getOrganization360(organizationId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Unable to load Organization 360.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  if (loading) {
    return (
      <AppShell area="admin" title="Organization" breadcrumb="Organizations">
        <Skeleton height={520} />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell area="admin" title="Organization" breadcrumb="Organizations">
        <PageErrorState message={error ?? 'Organization not found.'} />
      </AppShell>
    );
  }

  const organization = data.organization;
  const location = [organization.city, organization.state, organization.country]
    .filter(Boolean)
    .join(', ');

  async function toggleStatus() {
    setBusy(true);
    try {
      await setOrganizationStatus(
        organization.id,
        organization.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      area="admin"
      title={organization.name}
      breadcrumb="Organizations / Organization 360"
      description="One institutional record across the full PlanoraHub relationship."
      actions={
        <>
          <Button variant="outline" onClick={() => setEdit(true)}>
            Edit
          </Button>
          <Button variant="outline" loading={busy} onClick={() => void toggleStatus()}>
            {organization.status === 'ACTIVE' ? 'Archive' : 'Restore'}
          </Button>
        </>
      }
    >
      <div className="page-stack organization-360">
        <Card>
          <div className="ui-card-content org360-hero">
            <div className="org360-identity">
              <div className="org360-title-line">
                <h2>{organization.name}</h2>
                <Badge tone={organization.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {organization.status}
                </Badge>
              </div>
              <p className="ui-help">
                {organization.industry || 'Industry not recorded'} · {location || 'Location not recorded'}
              </p>
            </div>

            <div className="org360-summary">
              {Object.entries({
                Contacts: data.summary.contacts,
                Leads: data.summary.leads,
                Prospects: data.summary.prospects,
                Clients: data.summary.clients,
                'Open tasks': data.summary.openTasks,
              }).map(([label, value]) => (
                <div className="org360-summary-item" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="org360-layout">
          <div className="page-stack">
            <Section
              title="Relationship lifecycle"
              subtitle="Lead, Prospect and Client records remain connected to this organization."
            >
              {data.leads.length === 0 ? (
                <EmptyState
                  icon="leads"
                  title="No CRM pursuit yet"
                  description="This organization exists institutionally but has no Lead, Prospect or Client record."
                />
              ) : (
                <div className="org360-list">
                  {data.leads.map((lead) => (
                    <Link className="org360-row org360-row-link" key={lead.id} href={`/leads/${lead.id}`}>
                      <div>
                        <strong>{lead.record_type}</strong>
                        <span>
                          {lead.stage.replaceAll('_', ' ')} · {lead.priority} priority · {lead.pursuit_progress}% pursuit
                        </span>
                      </div>
                      <b>Open →</b>
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="People & contacts"
              subtitle="Everyone known at this organization stays under one institutional record."
            >
              {data.contacts.length === 0 ? (
                <EmptyState
                  icon="contacts"
                  title="No contacts yet"
                  description="Contacts discovered during pursuit will appear here automatically."
                />
              ) : (
                <div className="org360-list">
                  {data.contacts.map((contact) => (
                    <div className="org360-row" key={contact.id}>
                      <div>
                        <div className="org360-inline-title">
                          <strong>{contact.first_name} {contact.last_name}</strong>
                          {contact.is_primary ? <Badge tone="purple">Primary</Badge> : null}
                        </div>
                        <span>
                          {contact.job_title || 'Role not recorded'} · {Number(contact.verified_method_count) || 0} verified method(s)
                        </span>
                      </div>
                      <small>{contact.email || contact.phone || `${contact.method_count} contact method(s)`}</small>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="Recent activity"
              subtitle="Calls, meetings, notes, follow-ups and relationship events."
            >
              {data.activities.length === 0 ? (
                <EmptyState
                  icon="activity"
                  title="No activity recorded"
                  description="Meaningful CRM activity tied to this organization will appear here."
                />
              ) : (
                <div className="org360-list">
                  {data.activities.slice(0, 10).map((activity) => (
                    <div className="org360-activity" key={activity.id}>
                      <div className="org360-activity-head">
                        <strong>{activity.title}</strong>
                        <time>{fmt(activity.created_at)}</time>
                      </div>
                      <span>
                        {activity.activity_type.replaceAll('_', ' ')} · {activity.status.replaceAll('_', ' ')}
                      </span>
                      {activity.outcome ? <p>{activity.outcome}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="page-stack org360-side">
            <Section title="Organization profile">
              <div className="org360-info-grid">
                <Info label="Legal name" value={organization.legal_name} />
                <Info label="Website" value={organization.website} />
                <Info label="General email" value={organization.email} />
                <Info label="Phone" value={organization.phone} />
                <Info
                  label="Address"
                  value={[
                    organization.address_line1,
                    organization.city,
                    organization.state,
                    organization.country,
                  ].filter(Boolean).join(', ')}
                />
                <Info
                  label="Account owner"
                  value={[organization.owner_first_name, organization.owner_last_name].filter(Boolean).join(' ')}
                />
                <Info label="Created" value={fmt(organization.created_at)} />
              </div>
              {organization.notes ? (
                <div className="org360-notes">
                  <span className="ui-help">Institutional notes</span>
                  <p>{organization.notes}</p>
                </div>
              ) : null}
            </Section>

            <Section title="Open work" subtitle="Tasks directly associated with this organization.">
              {data.tasks.length === 0 ? (
                <p className="ui-help">No tasks linked to this organization.</p>
              ) : (
                <div className="org360-list compact">
                  {data.tasks.slice(0, 8).map((task) => (
                    <Link className="org360-row org360-row-link" key={task.id} href={`/tasks/${task.id}`}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>
                          {task.status.replaceAll('_', ' ')} · {task.priority} · due {fmt(task.due_at)}
                        </span>
                      </div>
                      <b>→</b>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>

      <OrganizationFormDialog
        open={edit}
        organization={organization}
        onClose={() => setEdit(false)}
        onSaved={load}
      />
    </AppShell>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="ui-card-content org360-section">
        <h3>{title}</h3>
        {subtitle ? <p className="ui-help">{subtitle}</p> : null}
        {children}
      </div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="org360-info">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}
