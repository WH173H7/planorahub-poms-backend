import { apiFetch } from '@/lib/api/client';
import { supabase } from '@/lib/supabase/client';

type R<T> = { success: true; data: T };

export type InvoiceContact = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

export type InvoiceOrganization = {
  id: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string;
  contacts: InvoiceContact[];
};

export type InvoiceSettings = {
  organization_name: string;
  legal_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  invoice_prefix: string;
  sales_order_prefix: string;
  default_currency: string;
  default_payment_terms_days: number;
  default_notes_terms: string | null;
  bank_account_name: string | null;
  bank_name: string | null;
  naira_account: string | null;
  usd_account: string | null;
};

export type InvoiceItem = {
  id?: string;
  name: string;
  description: string | null;
  quantity: number | string;
  unit_price?: number | string;
  unitPrice?: number | string;
  tax_rate?: number | string;
  taxRate?: number | string;
  line_subtotal?: number | string;
  line_tax?: number | string;
  line_total?: number | string;
};

export type InvoicePayment = {
  id: string;
  payment_date: string;
  amount: number | string;
  method: string;
  account_name: string | null;
  reference: string | null;
  memo: string | null;
  receipt_sent_at: string | null;
  approval_status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  reviewed_by_id?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  reviewer_first_name?: string | null;
  reviewer_last_name?: string | null;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
};

export type InvoiceDelivery = {
  id: string;
  event_type: string;
  recipient_email: string | null;
  delivery_status: string | null;
  message: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  organization_id: string;
  contact_id: string | null;
  status: string;
  display_status: string;
  is_overdue?: boolean;
  organization_name: string;
  organization_legal_name?: string | null;
  organization_email?: string | null;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  contact_job_title?: string | null;
  issue_date: string;
  due_date: string;
  po_number: string | null;
  summary: string | null;
  currency: string;
  discount_type: 'NONE' | 'FIXED' | 'PERCENT';
  discount_value: number | string;
  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  notes_terms: string | null;
  bill_to_name: string | null;
  bill_to_contact_name: string | null;
  bill_to_email: string | null;
  bill_to_phone: string | null;
  bill_to_address: string | null;
  sent_at: string | null;
  last_reminder_at: string | null;
  created_at: string;
  updated_at: string;
  payment_count?: number;
  pending_payment_count?: number;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  deliveries: InvoiceDelivery[];
};

export type InvoiceSummary = {
  drafts: number;
  unpaid_count: number;
  overdue_count: number;
  unpaid_value: number | string;
  collected_this_month: number | string;
};

export type InvoiceListResult = { rows: Invoice[]; summary: InvoiceSummary };
export type InvoiceTaxRate = { id: string; name: string; rate: number | string; is_system: boolean; is_active: boolean };
export type InvoiceOptions = { organizations: InvoiceOrganization[]; settings: InvoiceSettings; taxRates: InvoiceTaxRate[] };

export type InvoiceDraftInput = {
  organizationId: string;
  contactId?: string | null;
  issueDate: string;
  dueDate: string;
  summary?: string | null;
  currency: string;
  discountType: 'NONE' | 'FIXED' | 'PERCENT';
  discountValue: number;
  notesTerms?: string | null;
  items: Array<{ name: string; description?: string | null; quantity: number; unitPrice: number; taxRate: number }>;
  saveAs: 'DRAFT' | 'UNSENT';
};

export async function listInvoices(input: { status?: string; q?: string } = {}) {
  const p = new URLSearchParams();
  if (input.status) p.set('status', input.status);
  if (input.q) p.set('q', input.q);
  return (await apiFetch<R<InvoiceListResult>>(`/invoices${p.toString() ? `?${p}` : ''}`)).data;
}

export async function getInvoiceOptions() {
  return (await apiFetch<R<InvoiceOptions>>('/invoices/options')).data;
}

export async function getInvoiceSettings() {
  return (await apiFetch<R<InvoiceSettings>>('/invoices/settings')).data;
}

export async function updateInvoiceSettings(input: Record<string, unknown>) {
  return (await apiFetch<R<InvoiceSettings>>('/invoices/settings', { method: 'PATCH', body: JSON.stringify(input) })).data;
}

export async function createInvoiceTaxRate(input: { name: string; rate: number }) {
  return (await apiFetch<R<InvoiceTaxRate>>('/invoices/tax-rates', { method: 'POST', body: JSON.stringify(input) })).data;
}

export async function updateInvoiceTaxRate(id: string, input: { name?: string; rate?: number; isActive?: boolean }) {
  return (await apiFetch<R<InvoiceTaxRate>>(`/invoices/tax-rates/${id}`, { method: 'PATCH', body: JSON.stringify(input) })).data;
}

export async function createInvoice(input: InvoiceDraftInput) {
  return (await apiFetch<R<Invoice>>('/invoices', { method: 'POST', body: JSON.stringify(input) })).data;
}

export async function updateInvoice(id: string, input: Partial<InvoiceDraftInput>) {
  return (await apiFetch<R<Invoice>>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(input) })).data;
}

export async function getInvoice(id: string) {
  return (await apiFetch<R<Invoice>>(`/invoices/${id}`)).data;
}

export async function sendInvoice(id: string, recipientEmail?: string) {
  return (await apiFetch<R<Invoice>>(`/invoices/${id}/send`, { method: 'POST', body: JSON.stringify({ recipientEmail: recipientEmail || undefined }) })).data;
}

export async function sendInvoiceReminder(id: string, recipientEmail?: string) {
  return (await apiFetch<R<Invoice>>(`/invoices/${id}/remind`, { method: 'POST', body: JSON.stringify({ recipientEmail: recipientEmail || undefined }) })).data;
}

export async function recordInvoicePayment(id: string, input: { paymentDate: string; amount: number; method: string; accountName?: string; reference?: string; memo?: string }) {
  return (await apiFetch<R<{ payment: InvoicePayment; invoice: Invoice; requiresApproval: boolean }>>(`/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify(input) })).data;
}

export async function reviewInvoicePayment(id: string, paymentId: string, decision: 'APPROVE' | 'REJECT', note?: string) {
  return (await apiFetch<R<Invoice>>(`/invoices/${id}/payments/${paymentId}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) })).data;
}

export async function sendInvoiceReceipt(id: string, paymentId: string, recipientEmail?: string) {
  return (await apiFetch<R<{ status: string; recipient: string }>>(`/invoices/${id}/payments/${paymentId}/receipt`, { method: 'POST', body: JSON.stringify({ recipientEmail: recipientEmail || undefined }) })).data;
}

export async function voidInvoice(id: string) {
  return (await apiFetch<R<Invoice>>(`/invoices/${id}/void`, { method: 'POST' })).data;
}

export async function downloadInvoicePdf(id: string, invoiceNumber: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No authenticated session was found.');
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api';
  let response: Response;
  try {
    response = await fetch(`${base}/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  } catch {
    throw new Error('Network error. Please try again.');
  }
  if (!response.ok) {
    let message = response.status >= 500 ? 'Something went wrong. Please try again.' : 'Unable to download invoice PDF.';
    try {
      const body = await response.json();
      const apiMessage = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
      if (apiMessage) message = apiMessage;
    } catch {
      // Keep the friendly fallback.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${invoiceNumber || 'PlanoraHub-invoice'}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
