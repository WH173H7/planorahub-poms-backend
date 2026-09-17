'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  createInvoiceTaxRate,
  recordInvoicePayment,
  sendInvoiceReceipt,
  updateInvoiceSettings,
  type Invoice,
  type InvoicePayment,
  type InvoiceSettings,
  type InvoiceTaxRate,
} from '@/lib/invoices/api';

export function money(value: number | string | null | undefined, currency = 'NGN') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function dateLabel(value: string | null | undefined) {
  if (!value) return '—';
  const iso = String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const date = iso ? new Date(`${iso}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

export function statusTone(status: string) {
  if (status === 'PAID' || status === 'APPROVED') return 'success';
  if (status === 'OVERDUE' || status === 'VOID' || status === 'REJECTED') return 'danger';
  if (status === 'PARTIALLY_PAID' || status === 'PENDING_APPROVAL') return 'warning';
  if (status === 'SENT') return 'info';
  if (status === 'UNSENT') return 'neutral';
  return 'purple';
}

export function InvoiceStatus({ status }: { status: string }) {
  return <span className={`invoice-status invoice-status--${status.toLowerCase()}`}>{statusLabel(status)}</span>;
}

export function RecipientEmailModal({
  open,
  title,
  suggestedEmail,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  suggestedEmail?: string | null;
  onClose: () => void;
  onSubmit: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmail(suggestedEmail || '');
    setError('');
  }, [open, suggestedEmail]);

  async function submit() {
    try {
      setBusy(true);
      setError('');
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid customer email address.');
      await onSubmit(email.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send this invoice.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} className="invoice-modal">
      <div className="invoice-form-stack">
        <p className="invoice-modal-intro">This customer does not have an email saved on the selected billing contact. Enter the address only if you want PlanoraHub to send this document by email.</p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input label="Customer email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="accounts@customer.com" />
        <div className="invoice-modal-actions">
          <Button variant="outline" onClick={onClose}>Not now</Button>
          <Button onClick={() => void submit()} loading={busy}>Send email</Button>
        </div>
      </div>
    </Modal>
  );
}

export function PaymentModal({
  invoice,
  open,
  onClose,
  onUpdated,
  isAdmin = false,
}: {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onUpdated: (invoice: Invoice) => void;
  isAdmin?: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [accountName, setAccountName] = useState('');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recorded, setRecorded] = useState<InvoicePayment | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState('');

  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(String(Number(invoice.balance_due || 0).toFixed(2)));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setMethod('BANK_TRANSFER');
    setAccountName('');
    setReference('');
    setMemo('');
    setError('');
    setRecorded(null);
    setRequiresApproval(false);
    setReceiptEmail(invoice.bill_to_email || invoice.organization_email || '');
  }, [open, invoice?.id]);

  if (!invoice) return null;

  async function submit() {
    try {
      setBusy(true);
      setError('');
      const result = await recordInvoicePayment(invoice!.id, {
        paymentDate,
        amount: Number(amount),
        method,
        accountName,
        reference,
        memo,
      });
      setRecorded(result.payment);
      setRequiresApproval(result.requiresApproval);
      onUpdated(result.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit this payment confirmation.');
    } finally {
      setBusy(false);
    }
  }

  async function receipt() {
    if (!recorded) return;
    try {
      setBusy(true);
      setError('');
      await sendInvoiceReceipt(invoice!.id, recorded.id, receiptEmail || undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send the receipt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={recorded ? (requiresApproval ? 'Payment submitted' : 'Payment recorded') : `${isAdmin ? 'Record' : 'Submit'} payment · ${invoice.invoice_number}`} className="invoice-modal">
      {recorded ? (
        <div className="invoice-payment-success">
          <div className="invoice-success-mark" aria-hidden="true">✓</div>
          <h3>{requiresApproval ? 'Sent to Admin for review' : 'The payment was recorded'}</h3>
          <p>{requiresApproval ? `${money(recorded.amount, invoice.currency)} is pending Super Admin approval. The invoice balance will update only after approval.` : `${money(recorded.amount, invoice.currency)} was applied to ${invoice.invoice_number}.`}</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          {!requiresApproval && isAdmin && !invoice.bill_to_email ? <Input label="Customer email for receipt" type="email" value={receiptEmail} onChange={(e) => setReceiptEmail(e.target.value)} placeholder="accounts@customer.com" /> : null}
          <div className="invoice-modal-actions">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {!requiresApproval && isAdmin ? <Button onClick={() => void receipt()} loading={busy}>Send a receipt</Button> : null}
          </div>
        </div>
      ) : (
        <div className="invoice-form-stack">
          <p className="invoice-modal-intro">{isAdmin ? 'Record a confirmed customer payment.' : 'Submit a customer payment confirmation. Super Admin must approve it before the invoice balance changes.'}</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="invoice-form-grid two">
            <Input label="Payment date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            <Input label="Amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} help={`Outstanding: ${money(invoice.balance_due, invoice.currency)}`} />
          </div>
          <div className="invoice-form-grid two">
            <NativeSelect label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </NativeSelect>
            <Input label="Account / destination" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. PlanoraHub NGN account" />
          </div>
          <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer or cheque reference" />
          <Textarea label="Memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} placeholder="Optional payment note" />
          <div className="invoice-modal-actions">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void submit()} loading={busy}>{isAdmin ? 'Record payment' : 'Submit for review'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function InvoiceSettingsModal({
  open,
  settings,
  taxRates = [],
  onClose,
  onSaved,
  onTaxCreated,
}: {
  open: boolean;
  settings: InvoiceSettings | null;
  taxRates?: InvoiceTaxRate[];
  onClose: () => void;
  onSaved: (settings: InvoiceSettings) => void;
  onTaxCreated?: (tax: InvoiceTaxRate) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [taxName, setTaxName] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [taxBusy, setTaxBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !settings) return;
    setForm({
      organizationName: settings.organization_name || '',
      legalName: settings.legal_name || '',
      address: settings.address || '',
      email: settings.email || '',
      phone: settings.phone || '',
      website: settings.website || '',
      invoicePrefix: settings.invoice_prefix || 'PH-INV',
      salesOrderPrefix: settings.sales_order_prefix || 'PH-SO',
      defaultCurrency: settings.default_currency || 'NGN',
      defaultPaymentTermsDays: String(settings.default_payment_terms_days ?? 30),
      defaultNotesTerms: settings.default_notes_terms || '',
      bankAccountName: settings.bank_account_name || '',
      bankName: settings.bank_name || '',
      nairaAccount: settings.naira_account || '',
      usdAccount: settings.usd_account || '',
    });
    setTaxName('');
    setTaxRate('');
    setError('');
  }, [open, settings]);

  function set(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }

  async function save() {
    try {
      setBusy(true);
      setError('');
      const result = await updateInvoiceSettings({ ...form, defaultPaymentTermsDays: Number(form.defaultPaymentTermsDays || 30) });
      onSaved(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save invoice settings.');
    } finally {
      setBusy(false);
    }
  }

  async function addTax() {
    try {
      setTaxBusy(true);
      setError('');
      const created = await createInvoiceTaxRate({ name: taxName.trim(), rate: Number(taxRate) });
      onTaxCreated?.(created);
      setTaxName('');
      setTaxRate('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create custom tax.');
    } finally {
      setTaxBusy(false);
    }
  }

  const paymentReady = Boolean(form.bankAccountName?.trim() && form.bankName?.trim() && form.nairaAccount?.trim());

  return (
    <Modal open={open} onClose={onClose} title="Invoice settings" className="invoice-settings-modal">
      <div className="invoice-form-stack">
        <p className="invoice-modal-intro">These details appear on PlanoraHub invoices and customer emails.</p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="invoice-settings-section">
          <h3>Business identity</h3>
          <div className="invoice-form-grid two">
            <Input label="Business name" value={form.organizationName || ''} onChange={(e) => set('organizationName', e.target.value)} />
            <Input label="Legal name" value={form.legalName || ''} onChange={(e) => set('legalName', e.target.value)} />
          </div>
          <Textarea label="Business address" value={form.address || ''} onChange={(e) => set('address', e.target.value)} rows={3} />
          <div className="invoice-form-grid two">
            <Input label="Billing email" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
            <Input label="Phone" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <Input label="Website" value={form.website || ''} onChange={(e) => set('website', e.target.value)} />
        </div>
        <div className="invoice-settings-section">
          <h3>Invoice defaults</h3>
          <div className="invoice-form-grid two">
            <Input label="Invoice prefix" value={form.invoicePrefix || ''} onChange={(e) => set('invoicePrefix', e.target.value)} />
            <Input label="P.O./S.O. prefix" value={form.salesOrderPrefix || ''} onChange={(e) => set('salesOrderPrefix', e.target.value)} help="PlanoraHub automatically increments this reference." />
          </div>
          <div className="invoice-form-grid two">
            <Input label="Currency" value={form.defaultCurrency || ''} onChange={(e) => set('defaultCurrency', e.target.value.toUpperCase())} maxLength={3} />
            <Input label="Payment terms (days)" type="number" min="0" max="365" value={form.defaultPaymentTermsDays || ''} onChange={(e) => set('defaultPaymentTermsDays', e.target.value)} />
          </div>
          <Textarea label="Default notes / terms" value={form.defaultNotesTerms || ''} onChange={(e) => set('defaultNotesTerms', e.target.value)} rows={4} />
        </div>
        <div className="invoice-settings-section">
          <h3>Payment instructions</h3>
          {!paymentReady ? <Alert tone="warning">Account name, bank name and account number are required before an invoice can be issued, downloaded or emailed.</Alert> : null}
          <div className="invoice-form-grid two">
            <Input label="Account number" value={form.nairaAccount || ''} onChange={(e) => set('nairaAccount', e.target.value)} />
            <Input label="Bank name" value={form.bankName || ''} onChange={(e) => set('bankName', e.target.value)} />
          </div>
          <div className="invoice-form-grid two">
            <Input label="Account name" value={form.bankAccountName || ''} onChange={(e) => set('bankAccountName', e.target.value)} />
            <Input label="Domiciliary account (USD)" value={form.usdAccount || ''} onChange={(e) => set('usdAccount', e.target.value)} />
          </div>
        </div>
        <div className="invoice-settings-section">
          <h3>Tax rates</h3>
          <p className="invoice-modal-intro">Built-in and custom taxes appear in the item tax dropdown.</p>
          <div className="invoice-tax-chip-list">
            {taxRates.map((tax) => <span className="invoice-tax-chip" key={tax.id}>{tax.name} · {Number(tax.rate)}%</span>)}
          </div>
          <div className="invoice-form-grid two">
            <Input label="Custom tax name" value={taxName} onChange={(e) => setTaxName(e.target.value)} placeholder="e.g. Service levy" />
            <Input label="Rate (%)" type="number" min="0" max="100" step="0.001" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => void addTax()} loading={taxBusy} disabled={!taxName.trim() || taxRate === ''}>+ Create custom tax</Button>
        </div>
        <div className="invoice-modal-actions">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} loading={busy}>Save settings</Button>
        </div>
      </div>
    </Modal>
  );
}
