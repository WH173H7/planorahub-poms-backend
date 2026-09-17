'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import {
  downloadInvoicePdf,
  getInvoice,
  sendInvoice,
  sendInvoiceReminder,
  reviewInvoicePayment,
  voidInvoice,
  type Invoice,
} from '@/lib/invoices/api';
import { InvoiceStatus, PaymentModal, RecipientEmailModal, dateLabel, money, statusLabel } from './invoice-ui';

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roleCode, setRoleCode] = useState('');
  const [emailAction, setEmailAction] = useState<'send' | 'remind' | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [row, user] = await Promise.all([getInvoice(invoiceId), getCurrentCrmUser()]);
      setInvoice(row);
      setPermissions(user.permissions || []);
      setRoleCode(user.role_code || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load invoice.');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { void load(); }, [load]);

  async function action(type: 'send' | 'remind' | 'void', recipientEmail?: string) {
    if (!invoice) return;
    if (type !== 'void' && !recipientEmail && !invoice.bill_to_email) {
      setEmailAction(type);
      return;
    }
    try {
      setBusy(type);
      setError('');
      const next = type === 'send'
        ? await sendInvoice(invoice.id, recipientEmail)
        : type === 'remind'
          ? await sendInvoiceReminder(invoice.id, recipientEmail)
          : await voidInvoice(invoice.id);
      setInvoice(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete invoice action.');
    } finally {
      setBusy('');
    }
  }

  async function reviewPayment(paymentId: string, decision: 'APPROVE' | 'REJECT') {
    if (!invoice) return;
    const note = decision === 'REJECT' ? window.prompt('Reason for rejecting this payment confirmation (optional):') || '' : '';
    if (!window.confirm(`${decision === 'APPROVE' ? 'Approve' : 'Reject'} this payment confirmation?`)) return;
    try {
      setBusy(`payment-${paymentId}`);
      setError('');
      const next = await reviewInvoicePayment(invoice.id, paymentId, decision, note);
      setInvoice(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to review payment confirmation.');
    } finally {
      setBusy('');
    }
  }


  async function download() {
    if (!invoice) return;
    try {
      setBusy('pdf');
      setError('');
      await downloadInvoicePdf(invoice.id, invoice.invoice_number);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to download invoice PDF.');
    } finally {
      setBusy('');
    }
  }

  const canCreate = permissions.includes('invoices.create');
  const canSend = permissions.includes('invoices.send');
  const canRecord = permissions.includes('invoices.record_payment');
  const canManage = permissions.includes('invoices.manage');
  const canApprove = permissions.includes('invoices.approve_payment');

  return (
    <AppShell
      area="auto"
      title={invoice?.invoice_number || 'Invoice'}
      breadcrumb="Finance / Invoices"
      description={invoice ? `${invoice.organization_name} · ${statusLabel(invoice.display_status)}` : 'Invoice details'}
      actions={<div className="invoice-header-actions"><Link href="/invoices" className="ui-button ui-button--outline ui-button--md">Back to invoices</Link>{invoice && canCreate && !['PAID', 'VOID'].includes(invoice.display_status) ? <Link href={`/invoices/${invoice.id}/edit`} className="ui-button ui-button--outline ui-button--md">Edit</Link> : null}</div>}
    >
      <div className="invoice-page-stack">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {loading ? <Card className="invoice-editor-loading">Loading invoice…</Card> : invoice ? (
          <>
            <Card className="invoice-detail-hero">
              <div className="invoice-detail-identity"><span className="eyebrow">Invoice</span><div className="invoice-detail-title-row"><h2>{invoice.invoice_number}</h2><InvoiceStatus status={invoice.display_status} /></div><p>{invoice.organization_name}{invoice.bill_to_contact_name ? ` · ${invoice.bill_to_contact_name}` : ''}</p><small>{invoice.bill_to_email || 'No billing email'}{invoice.bill_to_phone ? ` · ${invoice.bill_to_phone}` : ''}</small></div>
              <div className="invoice-detail-balance"><span>Amount due</span><strong>{money(invoice.balance_due, invoice.currency)}</strong><small>Total {money(invoice.total_amount, invoice.currency)} · Paid {money(invoice.amount_paid, invoice.currency)}</small></div>
            </Card>

            <div className="invoice-detail-actionbar">
              <Button variant="outline" loading={busy === 'pdf'} onClick={() => void download()}>Download PDF</Button>
              {canSend && !['PAID', 'VOID'].includes(invoice.display_status) ? <Button variant="outline" loading={busy === 'send'} onClick={() => void action('send')}>{invoice.sent_at ? 'Resend invoice' : 'Send invoice'}</Button> : null}
              {canSend && invoice.sent_at && Number(invoice.balance_due) > 0 && invoice.display_status !== 'VOID' ? <Button variant="outline" loading={busy === 'remind'} onClick={() => void action('remind')}>Send reminder</Button> : null}
              {canRecord && Number(invoice.balance_due) > 0 && !['DRAFT', 'VOID'].includes(invoice.display_status) ? <Button onClick={() => setPaymentOpen(true)}>{roleCode === 'SUPER_ADMIN' ? 'Record payment' : 'Submit payment'}</Button> : null}
              {canManage && Number(invoice.amount_paid) === 0 && invoice.display_status !== 'VOID' ? <Button variant="danger" loading={busy === 'void'} onClick={() => { if (window.confirm(`Void ${invoice.invoice_number}? This keeps the audit trail but removes it from outstanding totals.`)) void action('void'); }}>Void invoice</Button> : null}
            </div>

            <div className="invoice-detail-grid">
              <Card className="invoice-preview-card">
                <div className="invoice-preview-brand"><img src="/planorahub.png" alt="PlanoraHub" /><div><span>INVOICE</span><strong>{invoice.invoice_number}</strong></div></div>
                <div className="invoice-preview-meta">
                  <div><small>Bill to</small><strong>{invoice.bill_to_name || invoice.organization_name}</strong><span>{invoice.bill_to_contact_name || ''}</span><span>{invoice.bill_to_address || ''}</span></div>
                  <div><dl><dt>Invoice date</dt><dd>{dateLabel(invoice.issue_date)}</dd><dt>Payment due</dt><dd>{dateLabel(invoice.due_date)}</dd><dt>P.O./S.O.</dt><dd>{invoice.po_number || '—'}</dd></dl></div>
                </div>
                {invoice.summary ? <div className="invoice-preview-summary">{invoice.summary}</div> : null}
                <div className="invoice-preview-items">
                  <div className="invoice-preview-item-head"><span>Item</span><span>Qty</span><span>Price</span><span>Amount</span></div>
                  {invoice.items.map((item) => <div className="invoice-preview-item" key={item.id || `${item.name}-${item.description}`}><div><strong>{item.name}</strong>{item.description ? <small>{item.description}</small> : null}{Number(item.tax_rate || 0) > 0 ? <small>Tax {Number(item.tax_rate)}%</small> : null}</div><span>{Number(item.quantity)}</span><span>{money(item.unit_price || 0, invoice.currency)}</span><strong>{money(item.line_total || 0, invoice.currency)}</strong></div>)}
                </div>
                <div className="invoice-preview-totals"><div><span>Subtotal</span><strong>{money(invoice.subtotal, invoice.currency)}</strong></div>{Number(invoice.discount_amount) > 0 ? <div><span>Discount</span><strong>− {money(invoice.discount_amount, invoice.currency)}</strong></div> : null}{Number(invoice.tax_amount) > 0 ? <div><span>Tax</span><strong>{money(invoice.tax_amount, invoice.currency)}</strong></div> : null}<div className="is-total"><span>Total</span><strong>{money(invoice.total_amount, invoice.currency)}</strong></div>{Number(invoice.amount_paid) > 0 ? <div><span>Paid</span><strong>− {money(invoice.amount_paid, invoice.currency)}</strong></div> : null}<div className="is-due"><span>Amount due</span><strong>{money(invoice.balance_due, invoice.currency)}</strong></div></div>
                {invoice.notes_terms ? <div className="invoice-preview-notes"><span className="eyebrow">Notes / Terms</span><p>{invoice.notes_terms}</p></div> : null}
              </Card>

              <aside className="invoice-detail-side">
                <Card className="invoice-side-card"><span className="eyebrow">Payment history</span><h3>{invoice.payments.length ? `${invoice.payments.length} payment confirmation${invoice.payments.length === 1 ? '' : 's'}` : 'No payments yet'}</h3>{invoice.payments.length ? <div className="invoice-payment-list">{invoice.payments.map((row) => <div key={row.id} className={`invoice-payment-entry is-${String(row.approval_status || 'APPROVED').toLowerCase()}`}><div><strong>{money(row.amount, invoice.currency)}</strong><span>{dateLabel(row.payment_date)} · {statusLabel(row.method)}</span></div><small className="invoice-payment-approval">{statusLabel(row.approval_status || 'APPROVED')}</small>{row.reference ? <small>Ref: {row.reference}</small> : null}{row.review_note ? <small>Review note: {row.review_note}</small> : null}{row.receipt_sent_at ? <small className="invoice-receipt-sent">Receipt sent</small> : null}{canApprove && row.approval_status === 'PENDING_APPROVAL' ? <div className="invoice-payment-review-actions"><Button size="sm" loading={busy === `payment-${row.id}`} onClick={() => void reviewPayment(row.id, 'APPROVE')}>Approve</Button><Button size="sm" variant="outline" disabled={busy === `payment-${row.id}`} onClick={() => void reviewPayment(row.id, 'REJECT')}>Reject</Button></div> : null}</div>)}</div> : <p>Finance staff payment confirmations appear here for Admin review.</p>}</Card>
                <Card className="invoice-side-card"><span className="eyebrow">Delivery activity</span><h3>{invoice.sent_at ? 'Issued to customer' : 'Not sent yet'}</h3><div className="invoice-delivery-list">{invoice.deliveries.length ? invoice.deliveries.map((event) => <div key={event.id}><strong>{statusLabel(event.event_type)}</strong><span>{dateLabel(event.created_at)}</span><small>{event.recipient_email || ''}</small></div>) : <p>No invoice emails have been sent.</p>}</div></Card>
                <Card className="invoice-side-card"><span className="eyebrow">Customer</span><h3>{invoice.organization_name}</h3><p>{invoice.bill_to_address || 'No billing address recorded.'}</p><small>{invoice.bill_to_email || 'No email'}{invoice.bill_to_phone ? ` · ${invoice.bill_to_phone}` : ''}</small></Card>
              </aside>
            </div>
          </>
        ) : null}
      </div>
      <PaymentModal invoice={invoice} open={paymentOpen} onClose={() => setPaymentOpen(false)} onUpdated={(next) => { setInvoice(next); }} isAdmin={roleCode === 'SUPER_ADMIN'} />
      <RecipientEmailModal open={Boolean(emailAction)} title={emailAction === 'remind' ? 'Send payment reminder' : 'Send invoice'} suggestedEmail={invoice?.organization_email || null} onClose={() => setEmailAction(null)} onSubmit={async (email) => { if (emailAction) await action(emailAction, email); }} />
    </AppShell>
  );
}
