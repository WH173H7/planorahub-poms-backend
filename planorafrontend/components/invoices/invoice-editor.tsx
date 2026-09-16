'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  createInvoice,
  getInvoice,
  getInvoiceOptions,
  updateInvoice,
  type Invoice,
  type InvoiceDraftInput,
  type InvoiceOptions,
  type InvoiceSettings,
} from '@/lib/invoices/api';
import { InvoiceSettingsModal, money } from './invoice-ui';

type Row = { name: string; description: string; quantity: string; unitPrice: string; taxRate: string };

function today() { return new Date().toISOString().slice(0, 10); }
function addDays(value: string, days: number) { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function blankRow(): Row { return { name: '', description: '', quantity: '1', unitPrice: '0', taxRate: '0' }; }

export function InvoiceEditor({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const [options, setOptions] = useState<InvoiceOptions | null>(null);
  const [loaded, setLoaded] = useState<Invoice | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [contactId, setContactId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [summary, setSummary] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [discountType, setDiscountType] = useState<'NONE' | 'FIXED' | 'PERCENT'>('NONE');
  const [discountValue, setDiscountValue] = useState('0');
  const [notesTerms, setNotesTerms] = useState('');
  const [items, setItems] = useState<Row[]>([blankRow()]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const [opts, invoice, user] = await Promise.all([getInvoiceOptions(), invoiceId ? getInvoice(invoiceId) : Promise.resolve(null), getCurrentCrmUser()]);
        if (!active) return;
        setOptions(opts);
        setPermissions(user.permissions || []);
        const settings = opts.settings;
        if (invoice) {
          setLoaded(invoice);
          setOrganizationId(invoice.organization_id);
          setContactId(invoice.contact_id || '');
          setCustomerQuery(invoice.organization_name || '');
          setIssueDate(String(invoice.issue_date).slice(0, 10));
          setDueDate(String(invoice.due_date).slice(0, 10));
          setSummary(invoice.summary || '');
          setCurrency(invoice.currency || settings.default_currency || 'NGN');
          setDiscountType(invoice.discount_type || 'NONE');
          setDiscountValue(String(invoice.discount_value || 0));
          setNotesTerms(invoice.notes_terms || '');
          setItems((invoice.items || []).map((item) => ({
            name: item.name || '',
            description: item.description || '',
            quantity: String(item.quantity ?? 1),
            unitPrice: String(item.unit_price ?? item.unitPrice ?? 0),
            taxRate: String(item.tax_rate ?? item.taxRate ?? 0),
          })) || [blankRow()]);
        } else {
          setCurrency(settings.default_currency || 'NGN');
          setNotesTerms(settings.default_notes_terms || '');
          const start = today();
          setIssueDate(start);
          setDueDate(addDays(start, Number(settings.default_payment_terms_days || 30)));
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to prepare invoice editor.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [invoiceId]);

  const selectedOrganization = options?.organizations.find((org) => org.id === organizationId) || null;
  const contacts = selectedOrganization?.contacts || [];
  const selectedContact = contacts.find((contact) => contact.id === contactId) || null;
  const filteredOrganizations = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return options?.organizations.slice(0, 10) || [];
    return (options?.organizations || []).filter((org) => org.name.toLowerCase().includes(q) || org.contacts.some((c) => `${c.first_name} ${c.last_name} ${c.email || ''}`.toLowerCase().includes(q))).slice(0, 12);
  }, [customerQuery, options]);

  const totals = useMemo(() => {
    const parsed = items.map((item) => ({
      base: Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unitPrice || 0)),
      rate: Math.min(100, Math.max(0, Number(item.taxRate || 0))),
    }));
    const subtotal = parsed.reduce((sum, item) => sum + item.base, 0);
    const dv = Math.max(0, Number(discountValue || 0));
    const discount = discountType === 'FIXED' ? Math.min(subtotal, dv) : discountType === 'PERCENT' ? subtotal * Math.min(100, dv) / 100 : 0;
    const factor = subtotal > 0 ? Math.max(0, (subtotal - discount) / subtotal) : 1;
    const tax = parsed.reduce((sum, item) => sum + item.base * factor * item.rate / 100, 0);
    const total = subtotal - discount + tax;
    return { subtotal, discount, tax, total };
  }, [items, discountType, discountValue]);

  function patchItem(index: number, patch: Partial<Row>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function removeItem(index: number) {
    setItems((current) => current.length === 1 ? [blankRow()] : current.filter((_, i) => i !== index));
  }

  function chooseOrganization(id: string) {
    const org = options?.organizations.find((row) => row.id === id);
    if (!org) return;
    setOrganizationId(org.id);
    setCustomerQuery(org.name);
    const primary = org.contacts.find((contact) => contact.is_primary) || org.contacts[0];
    setContactId(primary?.id || '');
    setCustomerOpen(false);
  }

  function payload(saveAs: 'DRAFT' | 'UNSENT'): InvoiceDraftInput {
    return {
      organizationId,
      contactId: contactId || null,
      issueDate,
      dueDate,
      summary: summary || null,
      currency,
      discountType,
      discountValue: Number(discountValue || 0),
      notesTerms: notesTerms || null,
      items: items.map((item) => ({
        name: item.name,
        description: item.description || null,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        taxRate: Number(item.taxRate || 0),
      })),
      saveAs,
    };
  }

  async function save(saveAs: 'DRAFT' | 'UNSENT') {
    try {
      setBusy(true);
      setError('');
      if (saveAs === 'UNSENT' && settings && (!settings.bank_account_name || !settings.bank_name || !settings.naira_account)) {
        if (permissions.includes('invoices.manage')) setSettingsOpen(true);
        throw new Error(permissions.includes('invoices.manage')
          ? 'Complete Invoice settings first: Account name, Bank name and Account number are required.'
          : 'Invoice payment instructions are not configured. Ask Super Admin to complete Invoice settings before issuing this invoice.');
      }
      const result = invoiceId ? await updateInvoice(invoiceId, payload(saveAs)) : await createInvoice(payload(saveAs));
      router.push(`/invoices/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save invoice.');
    } finally {
      setBusy(false);
    }
  }

  const settings: InvoiceSettings | null = options?.settings || null;
  const canManage = permissions.includes('invoices.manage');

  return (
    <AppShell
      area="auto"
      title={invoiceId ? `Edit ${loaded?.invoice_number || 'invoice'}` : 'New invoice'}
      breadcrumb="Finance / Invoices"
      description={invoiceId ? 'Update customer, line items, payment terms and billing details.' : 'Build a branded PlanoraHub invoice from CRM customer records.'}
      actions={<div className="invoice-header-actions"><Link href={invoiceId ? `/invoices/${invoiceId}` : '/invoices'} className="ui-button ui-button--outline ui-button--md">Cancel</Link><Button variant="outline" loading={busy} onClick={() => void save('DRAFT')}>Save draft</Button><Button loading={busy} onClick={() => void save('UNSENT')}>{invoiceId ? 'Save invoice' : 'Create invoice'}</Button></div>}
    >
      <div className="invoice-editor-page">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {loading ? <Card className="invoice-editor-loading">Preparing invoice editor…</Card> : (
          <>
            <Card className="invoice-business-card">
              <div className="invoice-business-logo"><img src="/planorahub.png" alt="PlanoraHub" /></div>
              <div className="invoice-business-copy"><span className="eyebrow">Invoice from</span><h2>{settings?.organization_name || 'PlanoraHub'}</h2><p>{settings?.address || 'Add business address in invoice settings.'}</p><small>{[settings?.email, settings?.phone].filter(Boolean).join(' · ')}</small></div>
              <div className="invoice-business-actions"><span className="invoice-draft-number">{loaded?.invoice_number || 'Invoice number assigned on save'}</span>{canManage ? <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>Invoice settings</Button> : null}</div>
            </Card>

            <Card className="invoice-document-card">
              <div className="invoice-document-top">
                <div className="invoice-customer-picker">
                  <span className="ui-label">Bill to</span>
                  <div className="invoice-customer-search">
                    <input className="ui-input" value={customerQuery} onFocus={() => setCustomerOpen(true)} onChange={(e) => { setCustomerQuery(e.target.value); setCustomerOpen(true); if (organizationId) setOrganizationId(''); }} placeholder="Search customer organization…" />
                    {customerOpen ? <div className="invoice-customer-menu">
                      {filteredOrganizations.length ? filteredOrganizations.map((org) => <button type="button" key={org.id} onClick={() => chooseOrganization(org.id)}><strong>{org.name}</strong><small>{org.contacts[0] ? `${org.contacts[0].first_name} ${org.contacts[0].last_name}${org.contacts[0].email ? ` · ${org.contacts[0].email}` : ''}` : org.email || 'No contact email'}</small></button>) : <div className="invoice-customer-none">No matching CRM customer.</div>}
                    </div> : null}
                  </div>
                  {selectedOrganization ? <div className="invoice-selected-customer"><strong>{selectedOrganization.name}</strong><span>{[selectedOrganization.address_line1, selectedOrganization.city, selectedOrganization.state, selectedOrganization.country].filter(Boolean).join(', ') || 'No address recorded'}</span>{contacts.length ? <NativeSelect label="Billing contact" value={contactId} onChange={(e) => setContactId(e.target.value)}><option value="">Organization contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.first_name} {contact.last_name}{contact.email ? ` · ${contact.email}` : ''}</option>)}</NativeSelect> : null}{selectedContact ? <small>{selectedContact.job_title || 'Contact'} · {selectedContact.email || selectedContact.phone || 'No email/phone recorded'}</small> : null}</div> : null}
                </div>

                <div className="invoice-meta-grid">
                  <Input label="Invoice date" type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); if (!invoiceId && settings) setDueDate(addDays(e.target.value, Number(settings.default_payment_terms_days || 30))); }} />
                  <Input label="Payment due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  <Input label="P.O./S.O. number" value={loaded?.po_number || 'Auto-assigned on save'} readOnly help={`Sequence: ${settings?.sales_order_prefix || 'PH-SO'}-######`} />
                  <Input label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Project, engagement or invoice summary" />
                </div>
              </div>

              <div className="invoice-items-head"><span>Items</span><span>Quantity</span><span>Price</span><span>Tax</span><span>Amount</span><span /></div>
              <div className="invoice-items-list">
                {items.map((item, index) => {
                  const base = Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unitPrice || 0));
                  return <div className="invoice-item-row" key={index}>
                    <div className="invoice-item-main"><Input aria-label={`Item ${index + 1} name`} placeholder="Service or product" value={item.name} onChange={(e) => patchItem(index, { name: e.target.value })} /><Input aria-label={`Item ${index + 1} description`} placeholder="Description (optional)" value={item.description} onChange={(e) => patchItem(index, { description: e.target.value })} /></div>
                    <Input aria-label={`Item ${index + 1} quantity`} type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => patchItem(index, { quantity: e.target.value })} />
                    <Input aria-label={`Item ${index + 1} price`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => patchItem(index, { unitPrice: e.target.value })} />
                    <NativeSelect aria-label={`Item ${index + 1} tax`} value={item.taxRate} onChange={(e) => patchItem(index, { taxRate: e.target.value })}><option value="0">No tax</option>{(options?.taxRates || []).map((tax) => <option key={tax.id} value={String(tax.rate)}>{tax.name}</option>)}</NativeSelect>
                    <strong className="invoice-line-total">{money(base, currency)}</strong>
                    <button className="invoice-remove-item" type="button" onClick={() => removeItem(index)} aria-label="Remove item">×</button>
                  </div>;
                })}
              </div>
              <button type="button" className="invoice-add-item" onClick={() => setItems((current) => [...current, blankRow()])}>＋ Add an item</button>

              <div className="invoice-document-bottom">
                <div className="invoice-notes-panel">
                  <Textarea label="Notes / Terms" value={notesTerms} onChange={(e) => setNotesTerms(e.target.value)} rows={7} placeholder="Payment instructions, terms and customer notes…" />
                </div>
                <div className="invoice-totals-panel">
                  <div><span>Subtotal</span><strong>{money(totals.subtotal, currency)}</strong></div>
                  <div className="invoice-discount-control"><span>Discount</span><NativeSelect aria-label="Discount type" value={discountType} onChange={(e) => setDiscountType(e.target.value as typeof discountType)}><option value="NONE">None</option><option value="PERCENT">%</option><option value="FIXED">Fixed</option></NativeSelect>{discountType !== 'NONE' ? <Input aria-label="Discount value" type="number" min="0" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} /> : null}</div>
                  {totals.discount > 0 ? <div><span>Discount applied</span><strong>− {money(totals.discount, currency)}</strong></div> : null}
                  <div><span>Tax</span><strong>{money(totals.tax, currency)}</strong></div>
                  <div className="invoice-total-row"><span>Total</span><strong>{money(totals.total, currency)}</strong></div>
                  <div className="invoice-currency-row"><span>Currency</span><NativeSelect aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="NGN">NGN — Naira</option><option value="USD">USD — US Dollar</option><option value="GBP">GBP — Pound</option><option value="EUR">EUR — Euro</option></NativeSelect></div>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      <InvoiceSettingsModal open={settingsOpen} settings={settings} taxRates={options?.taxRates || []} onClose={() => setSettingsOpen(false)} onSaved={(next) => setOptions((current) => current ? { ...current, settings: next } : current)} onTaxCreated={(tax) => setOptions((current) => current ? { ...current, taxRates: [...current.taxRates, tax] } : current)} />
    </AppShell>
  );
}
