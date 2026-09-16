'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import {
  downloadInvoicePdf,
  getInvoiceOptions,
  listInvoices,
  sendInvoice,
  sendInvoiceReminder,
  type Invoice,
  type InvoiceListResult,
  type InvoiceSettings,
  type InvoiceTaxRate,
} from '@/lib/invoices/api';
import { InvoiceSettingsModal, InvoiceStatus, PaymentModal, RecipientEmailModal, dateLabel, money } from './invoice-ui';

type Tab = 'UNPAID' | 'DRAFT' | 'ALL';

export function InvoiceCenter() {
  const [data, setData] = useState<InvoiceListResult | null>(null);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [tab, setTab] = useState<Tab>('UNPAID');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<Invoice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roleCode, setRoleCode] = useState('');
  const [taxRates, setTaxRates] = useState<InvoiceTaxRate[]>([]);
  const [emailAction, setEmailAction] = useState<{ invoice: Invoice; type: 'send' | 'remind' } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [result, options, user] = await Promise.all([
        listInvoices({ q: query }),
        getInvoiceOptions(),
        getCurrentCrmUser(),
      ]);
      setData(result);
      setSettings(options.settings);
      setTaxRates(options.taxRates || []);
      setPermissions(user.permissions || []);
      setRoleCode(user.role_code || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load invoices.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const source = data?.rows || [];
    if (tab === 'DRAFT') return source.filter((row) => row.display_status === 'DRAFT');
    if (tab === 'UNPAID') return source.filter((row) => !['DRAFT', 'PAID', 'VOID'].includes(row.display_status));
    return source;
  }, [data, tab]);

  const canCreate = permissions.includes('invoices.create');
  const canSend = permissions.includes('invoices.send');
  const canRecord = permissions.includes('invoices.record_payment');
  const canManage = permissions.includes('invoices.manage');

  async function action(invoice: Invoice, type: 'send' | 'remind', recipientEmail?: string) {
    if (!recipientEmail && !invoice.bill_to_email) {
      setEmailAction({ invoice, type });
      return;
    }
    try {
      setBusyId(invoice.id);
      setError('');
      if (type === 'send') await sendInvoice(invoice.id, recipientEmail);
      else await sendInvoiceReminder(invoice.id, recipientEmail);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete invoice action.');
    } finally {
      setBusyId('');
    }
  }

  async function download(invoice: Invoice) {
    try {
      setBusyId(invoice.id);
      setError('');
      await downloadInvoicePdf(invoice.id, invoice.invoice_number);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to download invoice PDF.');
    } finally {
      setBusyId('');
    }
  }


  return (
    <AppShell
      area="auto"
      title="Invoices"
      breadcrumb="Finance"
      description="Create customer invoices, send them from PlanoraHub, track balances and record confirmed payments."
      actions={<div className="invoice-header-actions">{canManage ? <Button variant="outline" onClick={() => setSettingsOpen(true)}>Invoice settings</Button> : null}{canCreate ? <Link href="/invoices/new" className="ui-button ui-button--primary ui-button--md">+ New invoice</Link> : null}</div>}
    >
      <div className="invoice-page-stack">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <section className="invoice-kpi-grid">
          <Card className="invoice-kpi"><span>Outstanding</span><strong>{money(data?.summary.unpaid_value || 0, settings?.default_currency || 'NGN')}</strong><small>{data?.summary.unpaid_count || 0} open invoice{Number(data?.summary.unpaid_count || 0) === 1 ? '' : 's'}</small></Card>
          <Card className="invoice-kpi"><span>Overdue</span><strong>{data?.summary.overdue_count || 0}</strong><small>Needs follow-up</small></Card>
          <Card className="invoice-kpi"><span>Drafts</span><strong>{data?.summary.drafts || 0}</strong><small>Not yet issued</small></Card>
          <Card className="invoice-kpi"><span>Collected this month</span><strong>{money(data?.summary.collected_this_month || 0, settings?.default_currency || 'NGN')}</strong><small>Recorded payments</small></Card>
        </section>

        <Card className="invoice-workspace-card">
          <div className="invoice-list-toolbar">
            <div className="invoice-tabs" role="tablist" aria-label="Invoice filters">
              <button className={tab === 'UNPAID' ? 'is-active' : ''} onClick={() => setTab('UNPAID')}>Unpaid <span>{data?.summary.unpaid_count || 0}</span></button>
              <button className={tab === 'DRAFT' ? 'is-active' : ''} onClick={() => setTab('DRAFT')}>Draft <span>{data?.summary.drafts || 0}</span></button>
              <button className={tab === 'ALL' ? 'is-active' : ''} onClick={() => setTab('ALL')}>All invoices</button>
            </div>
            <div className="invoice-search-wrap"><Input aria-label="Search invoices" placeholder="Search invoice #, customer or email…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          </div>

          {loading ? <div className="invoice-list-state">Loading invoices…</div> : rows.length ? (
            <>
              <div className="invoice-table-wrap">
                <table className="invoice-table">
                  <thead><tr><th>Status</th><th>Due</th><th>Date</th><th>Number</th><th>Customer</th><th>Total</th><th>Balance</th><th>Actions</th></tr></thead>
                  <tbody>
                    {rows.map((invoice) => (
                      <tr key={invoice.id}>
                        <td><InvoiceStatus status={invoice.display_status} /></td>
                        <td><span className={invoice.is_overdue ? 'invoice-overdue-text' : ''}>{dateLabel(invoice.due_date)}</span></td>
                        <td>{dateLabel(invoice.issue_date)}</td>
                        <td><Link className="invoice-number-link" href={`/invoices/${invoice.id}`}>{invoice.invoice_number}</Link></td>
                        <td><div className="invoice-customer-cell"><strong>{invoice.organization_name}</strong><small>{invoice.bill_to_email || 'No billing email'}</small></div></td>
                        <td>{money(invoice.total_amount, invoice.currency)}</td>
                        <td><strong>{money(invoice.balance_due, invoice.currency)}</strong>{Number(invoice.pending_payment_count || 0) > 0 ? <small className="invoice-pending-note">{invoice.pending_payment_count} awaiting Admin review</small> : null}</td>
                        <td>
                          <div className="invoice-row-actions">
                            <Link href={`/invoices/${invoice.id}`} className="invoice-link-button">View</Link>
                            {canRecord && Number(invoice.balance_due) > 0 && !['DRAFT', 'VOID'].includes(invoice.display_status) ? <button onClick={() => setPayment(invoice)}>{roleCode === 'SUPER_ADMIN' ? 'Record payment' : 'Submit payment'}</button> : null}
                            {canSend && invoice.display_status === 'DRAFT' ? <button disabled={busyId === invoice.id} onClick={() => void action(invoice, 'send')}>Send</button> : null}
                            {canSend && invoice.display_status === 'UNSENT' ? <button disabled={busyId === invoice.id} onClick={() => void action(invoice, 'send')}>Send</button> : null}
                            {canSend && Number(invoice.balance_due) > 0 && ['SENT', 'OVERDUE', 'PARTIALLY_PAID'].includes(invoice.display_status) ? <button disabled={busyId === invoice.id} onClick={() => void action(invoice, 'remind')}>Remind</button> : null}
                            <button disabled={busyId === invoice.id} onClick={() => void download(invoice)}>PDF</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="invoice-mobile-list">
                {rows.map((invoice) => (
                  <article key={invoice.id} className="invoice-mobile-card">
                    <div className="invoice-mobile-card-head"><InvoiceStatus status={invoice.display_status} /><span>{invoice.invoice_number}</span></div>
                    <Link href={`/invoices/${invoice.id}`} className="invoice-mobile-customer">{invoice.organization_name}</Link>
                    <div className="invoice-mobile-money"><div><small>Total</small><strong>{money(invoice.total_amount, invoice.currency)}</strong></div><div><small>Balance</small><strong>{money(invoice.balance_due, invoice.currency)}</strong></div></div>
                    <div className="invoice-mobile-meta"><span>Issued {dateLabel(invoice.issue_date)}</span><span className={invoice.is_overdue ? 'invoice-overdue-text' : ''}>Due {dateLabel(invoice.due_date)}</span></div>
                    <div className="invoice-mobile-actions"><Link href={`/invoices/${invoice.id}`}>View invoice</Link>{canRecord && Number(invoice.balance_due) > 0 && !['DRAFT', 'VOID'].includes(invoice.display_status) ? <button onClick={() => setPayment(invoice)}>{roleCode === 'SUPER_ADMIN' ? 'Record payment' : 'Submit payment'}</button> : null}</div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="invoice-empty-state"><div className="invoice-empty-icon">₦</div><h3>No invoices here yet</h3><p>Create the first PlanoraHub invoice or change the current filter.</p>{canCreate ? <Link href="/invoices/new" className="ui-button ui-button--primary ui-button--md">Create invoice</Link> : null}</div>
          )}
        </Card>
      </div>

      <PaymentModal invoice={payment} open={Boolean(payment)} onClose={() => setPayment(null)} onUpdated={(updated) => { setPayment(updated); void load(); }} isAdmin={roleCode === 'SUPER_ADMIN'} />
      <InvoiceSettingsModal open={settingsOpen} settings={settings} taxRates={taxRates} onClose={() => setSettingsOpen(false)} onSaved={(next) => setSettings(next)} onTaxCreated={(tax) => setTaxRates((current) => [...current, tax])} />
      <RecipientEmailModal
        open={Boolean(emailAction)}
        title={emailAction?.type === 'remind' ? 'Send payment reminder' : 'Send invoice'}
        suggestedEmail={emailAction?.invoice.organization_email || null}
        onClose={() => setEmailAction(null)}
        onSubmit={async (email) => { if (emailAction) await action(emailAction.invoice, emailAction.type, email); }}
      />
    </AppShell>
  );
}
