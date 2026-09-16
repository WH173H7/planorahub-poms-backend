'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PageErrorState } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { listOrganizations, type Organization } from '@/lib/organizations/api';
import { OrganizationFormDialog } from './organization-form-dialog';

export function OrganizationsView() {
  const [items, setItems] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [dialog, setDialog] = useState(false);

  async function load() {
    try {
      setError(null);
      setItems(await listOrganizations());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load organizations.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    listOrganizations()
      .then((rows) => active && setItems(rows))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : 'Unable to load organizations.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => items.filter((organization) =>
    (status === 'ALL' || organization.status === status) &&
    (!search.trim() || [organization.name, organization.legal_name, organization.industry, organization.city, organization.state, organization.country, organization.email]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()))
  ), [items, search, status]);

  const active = items.filter((item) => item.status === 'ACTIVE').length;

  return (
    <AppShell
      area="admin"
      title="Organizations"
      breadcrumb="Core CRM"
      description="Permanent institutional records connecting leads, people, work and relationship history."
      actions={<Button onClick={() => setDialog(true)}>+ New Organization</Button>}
    >
      <div className="page-stack organizations-page">
        <div className="crm-summary-grid">
          <Summary label="Organizations" value={items.length} />
          <Summary label="Active" value={active} />
          <Summary label="Archived / inactive" value={items.length - active} />
        </div>

        <Card>
          <div className="ui-card-content crm-filter-grid">
            <Input aria-label="Search organizations" placeholder="Search organization, industry or location…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <NativeSelect aria-label="Filter organization status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ACTIVE">Active organizations</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
              <option value="ALL">All statuses</option>
            </NativeSelect>
          </div>
        </Card>

        {loading ? <Skeleton height={360} /> : error ? <PageErrorState message={error} /> : visible.length === 0 ? (
          <Card><EmptyState icon="organizations" title="No organizations found" description="Organizations created manually or through Lead import will appear here." /></Card>
        ) : (
          <>
            <Card className="crm-desktop-table">
              <div className="table-wrap">
                <table className="ui-table">
                  <thead><tr><th>Organization</th><th>Industry</th><th>Location</th><th>General contact</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{visible.map((organization) => (
                    <tr key={organization.id}>
                      <td><strong>{organization.name}</strong>{organization.legal_name && organization.legal_name !== organization.name ? <div className="ui-help">{organization.legal_name}</div> : null}</td>
                      <td>{organization.industry || '—'}</td>
                      <td>{[organization.city, organization.state, organization.country].filter(Boolean).join(', ') || '—'}</td>
                      <td>{organization.email || organization.phone || '—'}</td>
                      <td><Badge tone={organization.status === 'ACTIVE' ? 'success' : organization.status === 'ARCHIVED' ? 'neutral' : 'warning'}>{organization.status}</Badge></td>
                      <td><Link href={`/organizations/${organization.id}`} className="crm-open-link">Open 360 →</Link></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>

            <div className="crm-mobile-list">
              {visible.map((organization) => (
                <Card key={organization.id}>
                  <div className="crm-mobile-card">
                    <div className="crm-mobile-card-head">
                      <div><strong>{organization.name}</strong><span>{organization.industry || 'Industry not recorded'}</span></div>
                      <Badge tone={organization.status === 'ACTIVE' ? 'success' : organization.status === 'ARCHIVED' ? 'neutral' : 'warning'}>{organization.status}</Badge>
                    </div>
                    <dl className="crm-mobile-meta">
                      <div><dt>Location</dt><dd>{[organization.city, organization.state, organization.country].filter(Boolean).join(', ') || '—'}</dd></div>
                      <div><dt>Contact</dt><dd>{organization.email || organization.phone || '—'}</dd></div>
                    </dl>
                    <Link href={`/organizations/${organization.id}`}><Button variant="outline">Open Organization 360</Button></Link>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
      <OrganizationFormDialog open={dialog} onClose={() => setDialog(false)} onSaved={load} />
    </AppShell>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Card><div className="crm-summary-card"><span>{label}</span><strong>{value}</strong></div></Card>;
}
