'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageErrorState } from '@/components/ui/page-state';
import { convertClient, listLifecycle, recordClientRevenue, type LifecycleRecord } from '@/lib/delivery/api';

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value ?? 0));

export function LifecycleView({ type }: { type: 'PROSPECT' | 'CLIENT' }) {
  const [rows, setRows] = useState<LifecycleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revenueTarget, setRevenueTarget] = useState<LifecycleRecord | null>(null);
  const [revenueValue, setRevenueValue] = useState('');

  async function load() {
    try {
      setRows(await listLifecycle(type));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load records.');
    }
  }

  useEffect(() => {
    let active = true;
    listLifecycle(type)
      .then((items) => { if (active) setRows(items); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load records.'); });
    return () => { active = false; };
  }, [type]);

  const title = type === 'PROSPECT' ? 'Prospects' : 'Clients';
  const expectedTotal = useMemo(() => rows.reduce((sum, row) => sum + Number(row.expected_revenue || 0), 0), [rows]);
  const realizedTotal = useMemo(() => rows.reduce((sum, row) => sum + Number(row.actual_revenue || 0), 0), [rows]);

  async function convert(row: LifecycleRecord) {
    if (!window.confirm(`Convert ${row.organization_name} to Client?`)) return;
    setBusy(row.id);
    try {
      await convertClient(row.id);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function saveRevenue() {
    if (!revenueTarget) return;
    const amount = Number(revenueValue);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusy(revenueTarget.id);
    try {
      await recordClientRevenue(revenueTarget.id, amount);
      setRevenueTarget(null);
      setRevenueValue('');
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell
      area="admin"
      title={title}
      breadcrumb="Core CRM"
      description={
        type === 'PROSPECT'
          ? 'Qualified organizations approved from Lead pursuit. Expected commercial value begins here.'
          : 'Converted customer relationships. Record realized revenue only after payment is confirmed.'
      }
    >
      <div className="page-stack lifecycle-page lifecycle-page-polished">
        <div className="lifecycle-kpi-grid">
          <Card><div className="ui-card-content"><span className="ui-help">{title}</span><strong className="lifecycle-kpi-value">{rows.length}</strong><small>Current relationships</small></div></Card>
          {type === 'PROSPECT' ? (
            <Card><div className="ui-card-content"><span className="ui-help">Expected revenue</span><strong className="lifecycle-kpi-value">{money(expectedTotal)}</strong><small>Opportunity value approved into Prospects</small></div></Card>
          ) : (
            <Card><div className="ui-card-content"><span className="ui-help">Realized revenue</span><strong className="lifecycle-kpi-value">{money(realizedTotal)}</strong><small>Revenue confirmed by Admin</small></div></Card>
          )}
        </div>

        {error ? (
          <PageErrorState message={error} />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={type === 'PROSPECT' ? 'prospects' : 'clients'}
              title={`No ${type.toLowerCase()}s yet`}
              description={type === 'PROSPECT' ? 'Leads approved from Prospect Review will appear here.' : 'Convert a Prospect when the relationship becomes a customer.'}
            />
          </Card>
        ) : (
          <Card className="lifecycle-card">
            <div className="lifecycle-summary-line">
              <div><span className="eyebrow">Relationship stage</span><h2>{title}</h2><p className="ui-help">{type === 'PROSPECT' ? 'Expected revenue is visible here because commercial qualification has started.' : 'Client revenue is recorded only when value has actually been realized.'}</p></div>
              <Badge tone={type === 'CLIENT' ? 'success' : 'purple'}>{rows.length} records</Badge>
            </div>

            <div className="lifecycle-desktop-table">
              <div className="table-wrap lifecycle-table-wrap">
                <table className="ui-table lifecycle-table-polished">
                  <thead><tr><th>Organization</th><th>Owner</th><th>{type === 'PROSPECT' ? 'Expected revenue' : 'Realized revenue'}</th><th>Contacts</th><th>Open work</th><th>Progress</th><th /></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="lifecycle-click-row" onClick={() => { window.location.href = `/organizations/${row.organization_id}`; }}>
                        <td><strong>{row.organization_name}</strong><div className="ui-help">{row.industry || 'Industry not recorded'}</div></td>
                        <td>{[row.owner_first_name, row.owner_last_name].filter(Boolean).join(' ') || 'Unassigned'}</td>
                        <td>
                          <strong>{type === 'PROSPECT' ? money(row.expected_revenue) : row.actual_revenue ? money(row.actual_revenue) : 'Not recorded'}</strong>
                          {type === 'CLIENT' && row.client_revenue_recorded_at ? <div className="ui-help">Revenue confirmed</div> : null}
                        </td>
                        <td>{row.contact_count}</td>
                        <td>{row.open_tasks}</td>
                        <td>{row.pursuit_progress}%</td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="lifecycle-actions">
                            <Link href={`/organizations/${row.organization_id}`}>Open 360 →</Link>
                            {type === 'PROSPECT' ? (
                              <Button size="sm" loading={busy === row.id} onClick={() => void convert(row)}>Convert Client</Button>
                            ) : (
                              <Button size="sm" variant={row.actual_revenue ? 'outline' : 'primary'} onClick={() => { setRevenueTarget(row); setRevenueValue(row.actual_revenue ? String(row.actual_revenue) : ''); }}>
                                {row.actual_revenue ? 'Update revenue' : 'Record revenue'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lifecycle-mobile-list">
              {rows.map((row) => (
                <article className="lifecycle-mobile-card" key={row.id}>
                  <header><div><strong>{row.organization_name}</strong><span>{row.industry || 'Industry not recorded'}</span></div><Badge tone={type === 'CLIENT' ? 'success' : 'purple'}>{type === 'CLIENT' ? 'Client' : 'Prospect'}</Badge></header>
                  <dl>
                    <div><dt>Owner</dt><dd>{[row.owner_first_name, row.owner_last_name].filter(Boolean).join(' ') || 'Unassigned'}</dd></div>
                    <div><dt>{type === 'PROSPECT' ? 'Expected revenue' : 'Realized revenue'}</dt><dd>{type === 'PROSPECT' ? money(row.expected_revenue) : row.actual_revenue ? money(row.actual_revenue) : 'Not recorded'}</dd></div>
                    <div><dt>Contacts</dt><dd>{row.contact_count}</dd></div><div><dt>Open work</dt><dd>{row.open_tasks}</dd></div><div><dt>Progress</dt><dd>{row.pursuit_progress}%</dd></div>
                  </dl>
                  <div className="lifecycle-mobile-actions">
                    <Link href={`/organizations/${row.organization_id}`}><Button variant="outline">Open Organization 360</Button></Link>
                    {type === 'PROSPECT' ? <Button loading={busy === row.id} onClick={() => void convert(row)}>Convert Client</Button> : <Button onClick={() => { setRevenueTarget(row); setRevenueValue(row.actual_revenue ? String(row.actual_revenue) : ''); }}>{row.actual_revenue ? 'Update revenue' : 'Record revenue'}</Button>}
                  </div>
                </article>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Modal open={Boolean(revenueTarget)} onClose={() => { if (!busy) { setRevenueTarget(null); setRevenueValue(''); } }} title="Record realized revenue" className="client-revenue-modal">
        <div className="stack">
          <div className="client-revenue-context">
            <span className="eyebrow">Client payment</span>
            <h3>{revenueTarget?.organization_name}</h3>
            <p>Record revenue only after payment/value has actually been realized. Saving this broadcasts an in-app and email recognition message to active PlanoraHub staff.</p>
          </div>
          <Input label="Realized revenue (₦) *" type="number" min="1" step="0.01" value={revenueValue} onChange={(event) => setRevenueValue(event.target.value)} placeholder="e.g. 2500000" />
          <div className="dialog-actions-row">
            <Button variant="outline" onClick={() => { setRevenueTarget(null); setRevenueValue(''); }} disabled={Boolean(busy)}>Cancel</Button>
            <Button loading={Boolean(revenueTarget && busy === revenueTarget.id)} disabled={!Number(revenueValue) || Number(revenueValue) <= 0} onClick={() => void saveRevenue()}>Save & notify staff</Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
