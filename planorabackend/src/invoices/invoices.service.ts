import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StaffMailService } from '../mailer/staff-mail.service.js';
import {
  LETTERHEAD_LOGO_HEIGHT,
  LETTERHEAD_LOGO_JPEG_BASE64,
  LETTERHEAD_LOGO_WIDTH,
} from '../letterhead/letterhead-logo.asset.js';

type Ctx = { actorUserId: string; roleCode?: string; ipAddress?: string; userAgent?: string };
type ItemInput = {
  name?: string;
  description?: string | null;
  quantity?: number | string;
  unitPrice?: number | string;
  taxRate?: number | string;
};
type InvoiceInput = {
  organizationId?: string;
  contactId?: string | null;
  issueDate?: string;
  dueDate?: string;
  summary?: string | null;
  currency?: string;
  discountType?: 'NONE' | 'FIXED' | 'PERCENT';
  discountValue?: number | string;
  notesTerms?: string | null;
  items?: ItemInput[];
  saveAs?: 'DRAFT' | 'UNSENT';
};

type CalculatedItem = {
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
};

type Totals = {
  items: CalculatedItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
};

// Database invoice rows are returned by pg as QueryResultRow.  Give the
// hydrated invoice an index signature so fields selected from `invoices`
// remain available after we append related collections.
type InvoiceDetail = {
  [key: string]: any;
  items: any[];
  payments: any[];
  deliveries: any[];
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly mail: StaffMailService,
  ) {}

  async settings() {
    return (await this.db.query(`SELECT * FROM invoice_settings WHERE singleton_key='DEFAULT' LIMIT 1`)).rows[0];
  }

  async updateSettings(body: any, ctx: Ctx) {
    const current = await this.settings();
    if (!current) throw new BadRequestException('Invoice settings are not initialized. Run migration 041.');
    const days = this.integer(body.defaultPaymentTermsDays ?? current.default_payment_terms_days, 30);
    if (days < 0 || days > 365) throw new BadRequestException('Payment terms must be between 0 and 365 days');
    const prefix = this.clean(body.invoicePrefix ?? current.invoice_prefix) || 'PH-INV';
    const salesOrderPrefix = this.clean(body.salesOrderPrefix ?? current.sales_order_prefix) || 'PH-SO';
    const currency = String(body.defaultCurrency ?? current.default_currency ?? 'NGN').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Default currency must be a 3-letter currency code');

    const row = (await this.db.query(
      `UPDATE invoice_settings SET
        organization_name=$1,legal_name=$2,address=$3,email=$4,phone=$5,website=$6,
        invoice_prefix=$7,default_currency=$8,default_payment_terms_days=$9,default_notes_terms=$10,
        bank_account_name=$11,bank_name=$12,naira_account=$13,usd_account=$14,sales_order_prefix=$15,
        updated_by_id=$16,updated_at=NOW()
       WHERE singleton_key='DEFAULT' RETURNING *`,
      [
        this.clean(body.organizationName ?? current.organization_name) || 'PlanoraHub',
        this.clean(body.legalName ?? current.legal_name),
        this.clean(body.address ?? current.address),
        this.clean(body.email ?? current.email),
        this.clean(body.phone ?? current.phone),
        this.clean(body.website ?? current.website),
        prefix,
        currency,
        days,
        this.clean(body.defaultNotesTerms ?? current.default_notes_terms),
        this.clean(body.bankAccountName ?? current.bank_account_name),
        this.clean(body.bankName ?? current.bank_name),
        this.clean(body.nairaAccount ?? current.naira_account),
        this.clean(body.usdAccount ?? current.usd_account),
        salesOrderPrefix,
        ctx.actorUserId,
      ],
    )).rows[0];

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      action: 'INVOICE_SETTINGS_UPDATED',
      module: 'finance',
      entityType: 'invoice_settings',
      oldValues: { invoicePrefix: current.invoice_prefix, defaultCurrency: current.default_currency, paymentTermsDays: current.default_payment_terms_days },
      newValues: { invoicePrefix: row.invoice_prefix, defaultCurrency: row.default_currency, paymentTermsDays: row.default_payment_terms_days },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return row;
  }

  async options() {
    const organizations = (await this.db.query(
      `SELECT o.id,o.name,o.legal_name,o.email,o.phone,o.address_line1,o.address_line2,o.city,o.state,o.country,o.status,
        COALESCE(
          jsonb_agg(jsonb_build_object('id',c.id,'first_name',c.first_name,'last_name',c.last_name,'job_title',c.job_title,'email',c.email,'phone',c.phone,'is_primary',c.is_primary)
            ORDER BY c.is_primary DESC,c.first_name,c.last_name) FILTER (WHERE c.id IS NOT NULL),
          '[]'::jsonb
        ) AS contacts
       FROM organizations o
       LEFT JOIN contacts c ON c.organization_id=o.id
       WHERE o.status='ACTIVE'
       GROUP BY o.id
       ORDER BY LOWER(o.name)`,
    )).rows;
    const settings = await this.settings();
    const taxRates = (await this.db.query(
      `SELECT id,name,rate,is_system,is_active FROM invoice_tax_rates WHERE is_active=TRUE ORDER BY is_system DESC,rate,name`,
    )).rows;
    return { organizations, settings, taxRates };
  }

  async createTaxRate(body: any, ctx: Ctx) {
    const name = this.clean(body.name);
    const rate = Number(body.rate);
    if (!name) throw new BadRequestException('Enter a tax name');
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new BadRequestException('Tax rate must be between 0 and 100');
    const row = (await this.db.query(
      `INSERT INTO invoice_tax_rates(name,rate,is_system,is_active,created_by_id) VALUES($1,$2,FALSE,TRUE,$3) RETURNING *`,
      [name, rate, ctx.actorUserId],
    )).rows[0];
    await this.audit.log({ actorUserId: ctx.actorUserId, action: 'INVOICE_TAX_CREATED', module: 'finance', entityType: 'invoice_tax_rate', entityId: row.id, newValues: { name: row.name, rate: Number(row.rate) }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return row;
  }

  async updateTaxRate(id: string, body: any, ctx: Ctx) {
    const current = (await this.db.query(`SELECT * FROM invoice_tax_rates WHERE id=$1 LIMIT 1`, [id])).rows[0];
    if (!current) throw new NotFoundException('Tax rate not found');
    if (current.is_system && body.isActive === false) throw new BadRequestException('Built-in tax rates cannot be disabled');
    const name = body.name === undefined ? current.name : this.clean(body.name);
    const rate = body.rate === undefined ? Number(current.rate) : Number(body.rate);
    if (!name) throw new BadRequestException('Enter a tax name');
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new BadRequestException('Tax rate must be between 0 and 100');
    const active = body.isActive === undefined ? current.is_active : Boolean(body.isActive);
    const row = (await this.db.query(`UPDATE invoice_tax_rates SET name=$2,rate=$3,is_active=$4,updated_at=NOW() WHERE id=$1 RETURNING *`, [id, name, rate, active])).rows[0];
    await this.audit.log({ actorUserId: ctx.actorUserId, action: 'INVOICE_TAX_UPDATED', module: 'finance', entityType: 'invoice_tax_rate', entityId: id, oldValues: { name: current.name, rate: Number(current.rate), active: current.is_active }, newValues: { name: row.name, rate: Number(row.rate), active: row.is_active }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return row;
  }

  async list(query: { status?: string; q?: string } = {}) {
    const status = String(query.status || '').trim().toUpperCase();
    const q = String(query.q || '').trim();
    const rows = (await this.db.query(
      `SELECT i.*,o.name AS organization_name,o.email AS organization_email,c.first_name AS contact_first_name,c.last_name AS contact_last_name,
        CASE
          WHEN i.status='VOID' THEN 'VOID'
          WHEN i.status='DRAFT' THEN 'DRAFT'
          WHEN i.balance_due<=0 THEN 'PAID'
          WHEN i.amount_paid>0 THEN 'PARTIALLY_PAID'
          WHEN i.due_date<CURRENT_DATE THEN 'OVERDUE'
          WHEN i.sent_at IS NOT NULL THEN 'SENT'
          ELSE 'UNSENT'
        END AS display_status,
        (i.due_date<CURRENT_DATE AND i.balance_due>0 AND i.status NOT IN ('DRAFT','VOID')) AS is_overdue,
        (SELECT COUNT(*)::int FROM invoice_payments p WHERE p.invoice_id=i.id AND p.approval_status='APPROVED') AS payment_count,
        (SELECT COUNT(*)::int FROM invoice_payments p WHERE p.invoice_id=i.id AND p.approval_status='PENDING_APPROVAL') AS pending_payment_count
       FROM invoices i
       JOIN organizations o ON o.id=i.organization_id
       LEFT JOIN contacts c ON c.id=i.contact_id
       WHERE ($1::text='' OR
          CASE
            WHEN i.status='VOID' THEN 'VOID'
            WHEN i.status='DRAFT' THEN 'DRAFT'
            WHEN i.balance_due<=0 THEN 'PAID'
            WHEN i.amount_paid>0 THEN 'PARTIALLY_PAID'
            WHEN i.due_date<CURRENT_DATE THEN 'OVERDUE'
            WHEN i.sent_at IS NOT NULL THEN 'SENT'
            ELSE 'UNSENT'
          END=$1)
         AND ($2::text='' OR i.invoice_number ILIKE '%'||$2||'%' OR o.name ILIKE '%'||$2||'%' OR COALESCE(i.bill_to_email,'') ILIKE '%'||$2||'%')
       ORDER BY i.created_at DESC`,
      [status, q],
    )).rows;

    const summary = (await this.db.query(
      `SELECT
        COUNT(*) FILTER(WHERE status='DRAFT')::int AS drafts,
        COUNT(*) FILTER(WHERE status<>'VOID' AND status<>'DRAFT' AND balance_due>0)::int AS unpaid_count,
        COUNT(*) FILTER(WHERE status<>'VOID' AND status<>'DRAFT' AND balance_due>0 AND due_date<CURRENT_DATE)::int AS overdue_count,
        COALESCE(SUM(balance_due) FILTER(WHERE status<>'VOID' AND status<>'DRAFT' AND balance_due>0),0)::numeric AS unpaid_value,
        COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.approval_status='APPROVED' AND date_trunc('month',p.payment_date::timestamp)=date_trunc('month',CURRENT_DATE::timestamp)),0)::numeric AS collected_this_month
       FROM invoices`,
    )).rows[0];

    return { rows, summary };
  }

  async get(id: string): Promise<InvoiceDetail> {
    const row = (await this.db.query(
      `SELECT i.*,o.name AS organization_name,o.legal_name AS organization_legal_name,o.email AS organization_email,
        c.first_name AS contact_first_name,c.last_name AS contact_last_name,c.job_title AS contact_job_title,
        CASE
          WHEN i.status='VOID' THEN 'VOID'
          WHEN i.status='DRAFT' THEN 'DRAFT'
          WHEN i.balance_due<=0 THEN 'PAID'
          WHEN i.amount_paid>0 THEN 'PARTIALLY_PAID'
          WHEN i.due_date<CURRENT_DATE THEN 'OVERDUE'
          WHEN i.sent_at IS NOT NULL THEN 'SENT'
          ELSE 'UNSENT'
        END AS display_status,
        (i.due_date<CURRENT_DATE AND i.balance_due>0 AND i.status NOT IN ('DRAFT','VOID')) AS is_overdue
       FROM invoices i
       JOIN organizations o ON o.id=i.organization_id
       LEFT JOIN contacts c ON c.id=i.contact_id
       WHERE i.id=$1 LIMIT 1`,
      [id],
    )).rows[0];
    if (!row) throw new NotFoundException('Invoice not found');
    const [items, payments, deliveries] = await Promise.all([
      this.db.query(`SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position,id`, [id]),
      this.db.query(`SELECT p.*,u.first_name,u.last_name,ru.first_name AS reviewer_first_name,ru.last_name AS reviewer_last_name FROM invoice_payments p LEFT JOIN users u ON u.id=p.created_by_id LEFT JOIN users ru ON ru.id=p.reviewed_by_id WHERE p.invoice_id=$1 ORDER BY p.payment_date DESC,p.created_at DESC`, [id]),
      this.db.query(`SELECT * FROM invoice_delivery_events WHERE invoice_id=$1 ORDER BY created_at DESC`, [id]),
    ]);
    return { ...row, items: items.rows, payments: payments.rows, deliveries: deliveries.rows };
  }

  async create(body: InvoiceInput, ctx: Ctx) {
    const normalized = await this.normalizeInput(body);
    const totals = this.calculate(normalized.items, normalized.discountType, normalized.discountValue);
    const settings = await this.settings();
    if (normalized.saveAs === 'UNSENT') this.ensurePaymentInstructions(settings);
    const invoiceNumber = await this.nextInvoiceNumber(settings?.invoice_prefix || 'PH-INV');
    const orderNumber = await this.nextOrderNumber(settings?.sales_order_prefix || 'PH-SO');
    const customer = await this.customerSnapshot(normalized.organizationId, normalized.contactId);
    const status = normalized.saveAs === 'UNSENT' ? 'UNSENT' : 'DRAFT';

    const c = await this.db.getClient();
    try {
      await c.query('BEGIN');
      const row = (await c.query(
        `INSERT INTO invoices(
          invoice_number,organization_id,contact_id,status,issue_date,due_date,po_number,summary,currency,
          discount_type,discount_value,subtotal,discount_amount,tax_amount,total_amount,amount_paid,balance_due,notes_terms,
          bill_to_name,bill_to_contact_name,bill_to_email,bill_to_phone,bill_to_address,created_by_id,updated_by_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$15,$16,$17,$18,$19,$20,$21,$22,$22) RETURNING *`,
        [
          invoiceNumber,
          normalized.organizationId,
          normalized.contactId,
          status,
          normalized.issueDate,
          normalized.dueDate,
          orderNumber,
          normalized.summary,
          normalized.currency,
          normalized.discountType,
          normalized.discountValue,
          totals.subtotal,
          totals.discountAmount,
          totals.taxAmount,
          totals.totalAmount,
          normalized.notesTerms,
          customer.organizationName,
          customer.contactName,
          customer.email,
          customer.phone,
          customer.address,
          ctx.actorUserId,
        ],
      )).rows[0];
      await this.insertItems(c, row.id, totals.items);
      await c.query('COMMIT');
      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action: status === 'DRAFT' ? 'INVOICE_DRAFT_CREATED' : 'INVOICE_CREATED',
        module: 'finance',
        entityType: 'invoice',
        entityId: row.id,
        newValues: { invoiceNumber, orderNumber, organizationId: normalized.organizationId, total: totals.totalAmount, currency: normalized.currency, status },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return this.get(row.id);
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  async update(id: string, body: InvoiceInput, ctx: Ctx) {
    const current = await this.get(id);
    if (current.status === 'VOID') throw new BadRequestException('A voided invoice cannot be edited');
    if (current.payments?.some((payment: any) => payment.approval_status === 'PENDING_APPROVAL')) throw new BadRequestException('Review the pending payment confirmation before editing this invoice');
    if (Number(current.amount_paid || 0) >= Number(current.total_amount || 0) && Number(current.total_amount || 0) > 0) throw new BadRequestException('A paid invoice cannot be edited');

    const normalized = await this.normalizeInput({
      ...body,
      organizationId: body.organizationId ?? current.organization_id,
      contactId: body.contactId === undefined ? current.contact_id : body.contactId,
      issueDate: body.issueDate ?? this.dateOnly(current.issue_date),
      dueDate: body.dueDate ?? this.dateOnly(current.due_date),
      summary: body.summary === undefined ? current.summary : body.summary,
      currency: body.currency ?? current.currency,
      discountType: body.discountType ?? current.discount_type,
      discountValue: body.discountValue ?? current.discount_value,
      notesTerms: body.notesTerms === undefined ? current.notes_terms : body.notesTerms,
      items: body.items ?? current.items.map((x: any) => ({ name: x.name, description: x.description, quantity: x.quantity, unitPrice: x.unit_price, taxRate: x.tax_rate })),
      saveAs: body.saveAs ?? (current.status === 'DRAFT' ? 'DRAFT' : 'UNSENT'),
    });
    const totals = this.calculate(normalized.items, normalized.discountType, normalized.discountValue);
    const paid = this.money(current.amount_paid);
    if (normalized.saveAs === 'UNSENT') this.ensurePaymentInstructions(await this.settings());
    if (totals.totalAmount + 0.001 < paid) throw new BadRequestException('Invoice total cannot be less than payments already recorded');
    const customer = await this.customerSnapshot(normalized.organizationId, normalized.contactId);
    const requestedStatus = normalized.saveAs === 'DRAFT' && !current.sent_at && paid === 0 ? 'DRAFT' : current.sent_at ? current.status : 'UNSENT';
    const balance = this.round(totals.totalAmount - paid);
    const nextStatus = balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : requestedStatus;

    const c = await this.db.getClient();
    try {
      await c.query('BEGIN');
      await c.query(
        `UPDATE invoices SET organization_id=$2,contact_id=$3,status=$4,issue_date=$5,due_date=$6,po_number=$7,summary=$8,currency=$9,
          discount_type=$10,discount_value=$11,subtotal=$12,discount_amount=$13,tax_amount=$14,total_amount=$15,balance_due=$16,notes_terms=$17,
          bill_to_name=$18,bill_to_contact_name=$19,bill_to_email=$20,bill_to_phone=$21,bill_to_address=$22,updated_by_id=$23,updated_at=NOW()
         WHERE id=$1`,
        [id, normalized.organizationId, normalized.contactId, nextStatus, normalized.issueDate, normalized.dueDate, current.po_number, normalized.summary,
          normalized.currency, normalized.discountType, normalized.discountValue, totals.subtotal, totals.discountAmount, totals.taxAmount, totals.totalAmount,
          balance, normalized.notesTerms, customer.organizationName, customer.contactName, customer.email, customer.phone, customer.address, ctx.actorUserId],
      );
      await c.query(`DELETE FROM invoice_items WHERE invoice_id=$1`, [id]);
      await this.insertItems(c, id, totals.items);
      await c.query('COMMIT');
      await this.audit.log({
        actorUserId: ctx.actorUserId,
        action: 'INVOICE_UPDATED',
        module: 'finance',
        entityType: 'invoice',
        entityId: id,
        oldValues: { total: Number(current.total_amount), status: current.display_status, organizationId: current.organization_id },
        newValues: { total: totals.totalAmount, status: nextStatus, organizationId: normalized.organizationId },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return this.get(id);
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  async sendInvoice(id: string, body: any, ctx: Ctx) {
    const invoice = await this.get(id);
    if (invoice.status === 'VOID') throw new BadRequestException('A voided invoice cannot be sent');
    if (!invoice.items?.length) throw new BadRequestException('Add at least one invoice item before sending');
    const settings = await this.settings();
    this.ensurePaymentInstructions(settings);
    const recipient = this.resolveRecipient(body?.recipientEmail, invoice.bill_to_email);
    if (recipient !== invoice.bill_to_email) await this.db.query(`UPDATE invoices SET bill_to_email=$2,updated_at=NOW() WHERE id=$1`, [id, recipient]);
    const pdf = this.buildPdf(settings, { ...invoice, bill_to_email: recipient });
    const delivery = await this.mail.sendWorkspaceMail({
      to: [recipient],
      subject: `${settings?.organization_name || 'PlanoraHub'} invoice ${invoice.invoice_number}`,
      senderName: settings?.organization_name || 'PlanoraHub',
      body: `Hello${invoice.bill_to_contact_name ? ` ${invoice.bill_to_contact_name}` : ''},\n\nPlease find invoice ${invoice.invoice_number} attached. The amount due is ${this.moneyText(invoice.balance_due, invoice.currency)} and payment is due ${this.prettyDate(invoice.due_date)}.\n\nThank you.`,
      attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdf.toString('base64'), contentType: 'application/pdf' }],
      idempotencyKey: `invoice/${id}/send/${Date.now()}`,
    });
    if (delivery.status !== 'SENT') throw new BadRequestException(delivery.message);
    await Promise.all([
      this.db.query(`UPDATE invoices SET status=CASE WHEN balance_due<=0 THEN 'PAID' WHEN amount_paid>0 THEN 'PARTIALLY_PAID' ELSE 'SENT' END,sent_at=COALESCE(sent_at,NOW()),updated_at=NOW() WHERE id=$1`, [id]),
      this.db.query(`INSERT INTO invoice_delivery_events(invoice_id,event_type,recipient_email,provider_id,delivery_status,message,created_by_id) VALUES($1,'INVOICE_SENT',$2,$3,$4,$5,$6)`, [id, recipient, delivery.id || null, delivery.status, delivery.message, ctx.actorUserId]),
    ]);
    await this.audit.log({ actorUserId: ctx.actorUserId, action: 'INVOICE_SENT', module: 'finance', entityType: 'invoice', entityId: id, newValues: { invoiceNumber: invoice.invoice_number, recipient, total: Number(invoice.total_amount) }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return this.get(id);
  }

  async remind(id: string, body: any, ctx: Ctx) {
    const invoice = await this.get(id);
    if (invoice.status === 'VOID' || Number(invoice.balance_due) <= 0) throw new BadRequestException('This invoice has no outstanding balance');
    const settings = await this.settings();
    this.ensurePaymentInstructions(settings);
    const recipient = this.resolveRecipient(body?.recipientEmail, invoice.bill_to_email);
    if (recipient !== invoice.bill_to_email) await this.db.query(`UPDATE invoices SET bill_to_email=$2,updated_at=NOW() WHERE id=$1`, [id, recipient]);
    const pdf = this.buildPdf(settings, { ...invoice, bill_to_email: recipient });
    const overdue = invoice.is_overdue ? `This invoice was due ${this.prettyDate(invoice.due_date)}.` : `Payment is due ${this.prettyDate(invoice.due_date)}.`;
    const delivery = await this.mail.sendWorkspaceMail({
      to: [recipient],
      subject: `Payment reminder — invoice ${invoice.invoice_number}`,
      senderName: settings?.organization_name || 'PlanoraHub',
      body: `Hello${invoice.bill_to_contact_name ? ` ${invoice.bill_to_contact_name}` : ''},\n\nThis is a friendly payment reminder for invoice ${invoice.invoice_number}. ${overdue}\nOutstanding balance: ${this.moneyText(invoice.balance_due, invoice.currency)}.\n\nA current copy of the invoice is attached. Thank you.`,
      attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdf.toString('base64'), contentType: 'application/pdf' }],
      idempotencyKey: `invoice/${id}/reminder/${Date.now()}`,
    });
    if (delivery.status !== 'SENT') throw new BadRequestException(delivery.message);
    await Promise.all([
      this.db.query(`UPDATE invoices SET last_reminder_at=NOW(),updated_at=NOW() WHERE id=$1`, [id]),
      this.db.query(`INSERT INTO invoice_delivery_events(invoice_id,event_type,recipient_email,provider_id,delivery_status,message,created_by_id) VALUES($1,'REMINDER_SENT',$2,$3,$4,$5,$6)`, [id, recipient, delivery.id || null, delivery.status, delivery.message, ctx.actorUserId]),
    ]);
    await this.audit.log({ actorUserId: ctx.actorUserId, action: 'INVOICE_REMINDER_SENT', module: 'finance', entityType: 'invoice', entityId: id, newValues: { invoiceNumber: invoice.invoice_number, recipient, balance: Number(invoice.balance_due) }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return this.get(id);
  }

  async recordPayment(id: string, body: any, ctx: Ctx) {
    const invoice = await this.get(id);
    if (invoice.status === 'VOID') throw new BadRequestException('Cannot record payment on a voided invoice');
    const balance = this.money(invoice.balance_due);
    if (balance <= 0) throw new BadRequestException('This invoice is already fully paid');
    const amount = this.money(body.amount);
    if (amount <= 0) throw new BadRequestException('Payment amount must be greater than zero');
    const pending = Number((await this.db.query(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM invoice_payments WHERE invoice_id=$1 AND approval_status='PENDING_APPROVAL'`, [id])).rows[0]?.total || 0);
    const available = this.round(Math.max(0, balance - pending));
    if (amount > available + 0.001) throw new BadRequestException(`Payment confirmation cannot exceed the unconfirmed balance of ${this.moneyText(available, invoice.currency)}`);
    const method = String(body.method || 'BANK_TRANSFER').trim().toUpperCase();
    if (!['BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'OTHER'].includes(method)) throw new BadRequestException('Choose a valid payment method');
    const paymentDate = this.validDate(body.paymentDate) || new Date().toISOString().slice(0, 10);
    const isAdmin = ctx.roleCode === 'SUPER_ADMIN';
    const approvalStatus = isAdmin ? 'APPROVED' : 'PENDING_APPROVAL';

    const c = await this.db.getClient();
    try {
      await c.query('BEGIN');
      const payment = (await c.query(
        `INSERT INTO invoice_payments(invoice_id,payment_date,amount,method,account_name,reference,memo,created_by_id,approval_status,reviewed_by_id,reviewed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $9='APPROVED' THEN NOW() ELSE NULL END) RETURNING *`,
        [id, paymentDate, amount, method, this.clean(body.accountName), this.clean(body.reference), this.clean(body.memo), ctx.actorUserId, approvalStatus, isAdmin ? ctx.actorUserId : null],
      )).rows[0];

      if (isAdmin) {
        const nextPaid = this.round(this.money(invoice.amount_paid) + amount);
        const nextBalance = this.round(this.money(invoice.total_amount) - nextPaid);
        const nextStatus = nextBalance <= 0 ? 'PAID' : 'PARTIALLY_PAID';
        await c.query(`UPDATE invoices SET amount_paid=$2,balance_due=$3,status=$4,updated_at=NOW() WHERE id=$1`, [id, nextPaid, Math.max(0, nextBalance), nextStatus]);
      }
      await c.query('COMMIT');
      if (!isAdmin) {
        await this.db.query(
          `INSERT INTO notifications(user_id,title,body,kind,href)
           SELECT u.id,'Invoice payment awaiting review',$1,'INVOICE_PAYMENT',$2
           FROM users u JOIN roles r ON r.id=u.role_id
           WHERE r.code='SUPER_ADMIN' AND u.status='ACTIVE'`,
          [`${invoice.invoice_number}: ${this.moneyText(amount, invoice.currency)} submitted for approval`, `/invoices/${id}`],
        );
      }
      await this.audit.log({ actorUserId: ctx.actorUserId, action: isAdmin ? 'INVOICE_PAYMENT_RECORDED' : 'INVOICE_PAYMENT_SUBMITTED', module: 'finance', entityType: 'invoice_payment', entityId: payment.id, newValues: { invoiceId: id, invoiceNumber: invoice.invoice_number, amount, method, paymentDate, approvalStatus }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
      return { payment, invoice: await this.get(id), requiresApproval: !isAdmin };
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  async reviewPayment(id: string, paymentId: string, body: any, ctx: Ctx) {
    const decision = String(body.decision || '').trim().toUpperCase();
    if (!['APPROVE', 'REJECT'].includes(decision)) throw new BadRequestException('Choose APPROVE or REJECT');
    const invoice = await this.get(id);
    const payment = (await this.db.query(`SELECT * FROM invoice_payments WHERE id=$1 AND invoice_id=$2 LIMIT 1`, [paymentId, id])).rows[0];
    if (!payment) throw new NotFoundException('Payment confirmation not found');
    if (payment.approval_status !== 'PENDING_APPROVAL') throw new BadRequestException('This payment confirmation has already been reviewed');
    const note = this.clean(body.note);

    const c = await this.db.getClient();
    try {
      await c.query('BEGIN');
      if (decision === 'REJECT') {
        await c.query(`UPDATE invoice_payments SET approval_status='REJECTED',reviewed_by_id=$3,reviewed_at=NOW(),review_note=$4 WHERE id=$1 AND invoice_id=$2`, [paymentId, id, ctx.actorUserId, note]);
      } else {
        const balance = this.money(invoice.balance_due);
        const amount = this.money(payment.amount);
        if (amount > balance + 0.001) throw new BadRequestException(`This payment exceeds the current outstanding balance of ${this.moneyText(balance, invoice.currency)}`);
        const nextPaid = this.round(this.money(invoice.amount_paid) + amount);
        const nextBalance = this.round(this.money(invoice.total_amount) - nextPaid);
        const nextStatus = nextBalance <= 0 ? 'PAID' : 'PARTIALLY_PAID';
        await c.query(`UPDATE invoice_payments SET approval_status='APPROVED',reviewed_by_id=$3,reviewed_at=NOW(),review_note=$4 WHERE id=$1 AND invoice_id=$2`, [paymentId, id, ctx.actorUserId, note]);
        await c.query(`UPDATE invoices SET amount_paid=$2,balance_due=$3,status=$4,updated_at=NOW() WHERE id=$1`, [id, nextPaid, Math.max(0, nextBalance), nextStatus]);
      }
      await c.query('COMMIT');
      await this.audit.log({ actorUserId: ctx.actorUserId, action: decision === 'APPROVE' ? 'INVOICE_PAYMENT_APPROVED' : 'INVOICE_PAYMENT_REJECTED', module: 'finance', entityType: 'invoice_payment', entityId: paymentId, oldValues: { status: 'PENDING_APPROVAL' }, newValues: { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', note }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
      return this.get(id);
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  async sendReceipt(id: string, paymentId: string, body: any, ctx: Ctx) {
    const invoice = await this.get(id);
    const payment = (await this.db.query(`SELECT * FROM invoice_payments WHERE id=$1 AND invoice_id=$2 LIMIT 1`, [paymentId, id])).rows[0];
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.approval_status !== 'APPROVED') throw new BadRequestException('Only approved payments can have a receipt sent');
    const settings = await this.settings();
    const recipient = this.resolveRecipient(body?.recipientEmail, invoice.bill_to_email);
    if (recipient !== invoice.bill_to_email) await this.db.query(`UPDATE invoices SET bill_to_email=$2,updated_at=NOW() WHERE id=$1`, [id, recipient]);
    const delivery = await this.mail.sendWorkspaceMail({
      to: [recipient],
      subject: `Payment receipt — ${invoice.invoice_number}`,
      senderName: settings?.organization_name || 'PlanoraHub',
      body: `Hello${invoice.bill_to_contact_name ? ` ${invoice.bill_to_contact_name}` : ''},\n\nWe received your payment of ${this.moneyText(payment.amount, invoice.currency)} for invoice ${invoice.invoice_number} on ${this.prettyDate(payment.payment_date)}.\nRemaining balance: ${this.moneyText(invoice.balance_due, invoice.currency)}.\n\nThank you.`,
      idempotencyKey: `invoice/${id}/payment/${paymentId}/receipt`,
    });
    if (delivery.status !== 'SENT') throw new BadRequestException(delivery.message);
    await Promise.all([
      this.db.query(`UPDATE invoice_payments SET receipt_sent_at=NOW() WHERE id=$1`, [paymentId]),
      this.db.query(`INSERT INTO invoice_delivery_events(invoice_id,event_type,recipient_email,provider_id,delivery_status,message,created_by_id) VALUES($1,'RECEIPT_SENT',$2,$3,$4,$5,$6)`, [id, recipient, delivery.id || null, delivery.status, delivery.message, ctx.actorUserId]),
    ]);
    await this.audit.log({ actorUserId: ctx.actorUserId, action: 'INVOICE_RECEIPT_SENT', module: 'finance', entityType: 'invoice_payment', entityId: paymentId, newValues: { invoiceNumber: invoice.invoice_number, recipient, amount: Number(payment.amount) }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { status: delivery.status, recipient };
  }

  async voidInvoice(id: string, ctx: Ctx) {
    const invoice = await this.get(id);
    if (Number(invoice.amount_paid) > 0) throw new BadRequestException('Invoices with recorded payments cannot be voided. Reverse the payment record first.');
    if (invoice.payments?.some((payment: any) => payment.approval_status === 'PENDING_APPROVAL')) throw new BadRequestException('Review the pending payment confirmation before voiding this invoice');
    if (invoice.status === 'VOID') return invoice;
    await this.db.query(`UPDATE invoices SET status='VOID',voided_at=NOW(),updated_by_id=$2,updated_at=NOW() WHERE id=$1`, [id, ctx.actorUserId]);
    await this.audit.log({ actorUserId: ctx.actorUserId, action: 'INVOICE_VOIDED', module: 'finance', entityType: 'invoice', entityId: id, oldValues: { status: invoice.display_status }, newValues: { status: 'VOID' }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return this.get(id);
  }

  async pdf(id: string, ctx: Ctx) {
    const [settings, invoice] = await Promise.all([this.settings(), this.get(id)]);
    this.ensurePaymentInstructions(settings);
    const file = this.buildPdf(settings, invoice);
    await this.audit.log({ actorUserId: ctx.actorUserId, action: 'INVOICE_PDF_DOWNLOADED', module: 'finance', entityType: 'invoice', entityId: id, newValues: { invoiceNumber: invoice.invoice_number, fileSize: file.length, balance: Number(invoice.balance_due) }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { file, invoiceNumber: invoice.invoice_number };
  }

  private async normalizeInput(body: InvoiceInput) {
    const organizationId = this.clean(body.organizationId);
    if (!organizationId) throw new BadRequestException('Choose a customer organization');
    const contactId = this.clean(body.contactId);
    const issueDate = this.validDate(body.issueDate) || new Date().toISOString().slice(0, 10);
    const settings = await this.settings();
    const defaultDays = this.integer(settings?.default_payment_terms_days, 30);
    const dueDate = this.validDate(body.dueDate) || this.addDays(issueDate, defaultDays);
    if (new Date(`${dueDate}T12:00:00Z`).getTime() < new Date(`${issueDate}T12:00:00Z`).getTime()) throw new BadRequestException('Payment due date cannot be before the invoice date');
    const currency = String(body.currency || settings?.default_currency || 'NGN').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a 3-letter code');
    const discountType = String(body.discountType || 'NONE').toUpperCase() as 'NONE' | 'FIXED' | 'PERCENT';
    if (!['NONE', 'FIXED', 'PERCENT'].includes(discountType)) throw new BadRequestException('Invalid discount type');
    const discountValue = this.money(body.discountValue || 0);
    if (discountValue < 0) throw new BadRequestException('Discount cannot be negative');
    if (discountType === 'PERCENT' && discountValue > 100) throw new BadRequestException('Percentage discount cannot exceed 100%');
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw new BadRequestException('Add at least one invoice item');
    return {
      organizationId,
      contactId,
      issueDate,
      dueDate,
      summary: this.clean(body.summary),
      currency,
      discountType,
      discountValue,
      notesTerms: body.notesTerms === undefined ? this.clean(settings?.default_notes_terms) : this.clean(body.notesTerms),
      items,
      saveAs: body.saveAs === 'UNSENT' ? 'UNSENT' as const : 'DRAFT' as const,
    };
  }

  private calculate(items: ItemInput[], discountType: string, discountValue: number): Totals {
    const parsed = items.map((item, index) => {
      const name = this.clean(item.name);
      if (!name) throw new BadRequestException(`Item ${index + 1} needs a name`);
      const quantity = Number(item.quantity ?? 1);
      const unitPrice = this.money(item.unitPrice ?? 0);
      const taxRate = Number(item.taxRate ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException(`Item ${index + 1} quantity must be greater than zero`);
      if (unitPrice < 0) throw new BadRequestException(`Item ${index + 1} price cannot be negative`);
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new BadRequestException(`Item ${index + 1} tax rate must be between 0 and 100`);
      const lineSubtotal = this.round(quantity * unitPrice);
      return { name, description: this.clean(item.description), quantity, unitPrice, taxRate, lineSubtotal };
    });
    const subtotal = this.round(parsed.reduce((sum, item) => sum + item.lineSubtotal, 0));
    let discountAmount = 0;
    if (discountType === 'FIXED') discountAmount = Math.min(subtotal, this.money(discountValue));
    if (discountType === 'PERCENT') discountAmount = this.round(subtotal * (this.money(discountValue) / 100));
    const factor = subtotal > 0 ? Math.max(0, (subtotal - discountAmount) / subtotal) : 1;
    const calculated = parsed.map((item) => {
      const lineTax = this.round(item.lineSubtotal * factor * (item.taxRate / 100));
      return { ...item, lineTax, lineTotal: this.round(item.lineSubtotal * factor + lineTax) };
    });
    const taxAmount = this.round(calculated.reduce((sum, item) => sum + item.lineTax, 0));
    const totalAmount = this.round(Math.max(0, subtotal - discountAmount + taxAmount));
    return { items: calculated, subtotal, discountAmount: this.round(discountAmount), taxAmount, totalAmount };
  }

  private async customerSnapshot(organizationId: string, contactId: string | null) {
    const org = (await this.db.query(`SELECT * FROM organizations WHERE id=$1 AND status='ACTIVE' LIMIT 1`, [organizationId])).rows[0];
    if (!org) throw new BadRequestException('Customer organization was not found or is inactive');
    let contact: any = null;
    if (contactId) {
      contact = (await this.db.query(`SELECT * FROM contacts WHERE id=$1 AND organization_id=$2 LIMIT 1`, [contactId, organizationId])).rows[0];
      if (!contact) throw new BadRequestException('Selected contact does not belong to this organization');
    } else {
      contact = (await this.db.query(`SELECT * FROM contacts WHERE organization_id=$1 ORDER BY is_primary DESC,created_at LIMIT 1`, [organizationId])).rows[0] || null;
    }
    const address = [org.address_line1, org.address_line2, org.city, org.state, org.country].filter(Boolean).join(', ') || null;
    return {
      organizationName: org.name,
      contactName: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : null,
      email: contact?.email || null,
      phone: contact?.phone || org.phone || null,
      address,
    };
  }

  private async nextInvoiceNumber(prefix: string) {
    const seq = Number((await this.db.query(`SELECT nextval('invoice_number_seq') AS n`)).rows[0]?.n || 1);
    const cleanPrefix = String(prefix || 'PH-INV').replace(/[^A-Za-z0-9-]/g, '').slice(0, 30) || 'PH-INV';
    return `${cleanPrefix}-${String(seq).padStart(6, '0')}`;
  }

  private async nextOrderNumber(prefix: string) {
    const seq = Number((await this.db.query(`SELECT nextval('invoice_order_number_seq') AS n`)).rows[0]?.n || 1);
    const cleanPrefix = String(prefix || 'PH-SO').replace(/[^A-Za-z0-9-]/g, '').slice(0, 30) || 'PH-SO';
    return `${cleanPrefix}-${String(seq).padStart(6, '0')}`;
  }

  private ensurePaymentInstructions(settings: any) {
    const missing = [
      !this.clean(settings?.bank_account_name) ? 'Account name' : null,
      !this.clean(settings?.bank_name) ? 'Bank name' : null,
      !this.clean(settings?.naira_account) ? 'Account number' : null,
    ].filter(Boolean);
    if (missing.length) throw new BadRequestException(`Complete Invoice settings before generating an invoice. Required: ${missing.join(', ')}.`);
  }

  private resolveRecipient(override: any, existing: any) {
    const recipient = this.clean(override) || this.clean(existing);
    if (!recipient) throw new BadRequestException('Enter the customer email before sending. You can continue without email if you are not sending the invoice.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new BadRequestException('Enter a valid customer email address');
    return recipient;
  }

  private async insertItems(client: any, invoiceId: string, items: CalculatedItem[]) {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await client.query(
        `INSERT INTO invoice_items(invoice_id,position,name,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [invoiceId, index, item.name, item.description, item.quantity, item.unitPrice, item.taxRate, item.lineSubtotal, item.lineTax, item.lineTotal],
      );
    }
  }

  private buildPdf(settings: any, invoice: any) {
    const logoHex = Buffer.from(LETTERHEAD_LOGO_JPEG_BASE64, 'base64').toString('hex').toUpperCase() + '>';
    const objects: (string | undefined)[] = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    let next = 5;
    const logoObj = next++;
    objects[logoObj] = `<< /Type /XObject /Subtype /Image /Width ${LETTERHEAD_LOGO_WIDTH} /Height ${LETTERHEAD_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${Buffer.byteLength(logoHex, 'ascii')} >>\nstream\n${logoHex}\nendstream`;

    const itemChunks: any[][] = [];
    const sourceItems = Array.isArray(invoice.items) ? invoice.items : [];
    for (let i = 0; i < sourceItems.length; i += 5) itemChunks.push(sourceItems.slice(i, i + 5));
    if (!itemChunks.length) itemChunks.push([]);
    const kids: string[] = [];

    itemChunks.forEach((items, pageIndex) => {
      const pageObj = next++;
      const contentObj = next++;
      kids.push(`${pageObj} 0 R`);
      const c: string[] = [];
      c.push('q', '1 1 1 rg', '0 0 595 842 re f', 'Q');
      c.push('q', '0.36 0.09 0.40 rg', '0 800 595 42 re f', 'Q');
      c.push(`q 112 0 0 68 48 718 cm /Logo Do Q`);
      c.push(`BT /F2 26 Tf 0.12 g 430 758 Td (${this.esc('INVOICE')}) Tj ET`);
      c.push(`BT /F2 10 Tf 0.36 0.09 0.40 rg 430 735 Td (${this.esc(invoice.invoice_number)}) Tj ET`);

      if (pageIndex === 0) {
        const company = settings?.organization_name || 'PlanoraHub';
        const companyAddress = this.wrap(String(settings?.address || ''), 52).slice(0, 2);
        c.push(`BT /F2 11 Tf 0.1 g 48 694 Td (${this.esc(company)}) Tj ET`);
        let cy = 678;
        for (const line of companyAddress) { c.push(`BT /F1 8.5 Tf 0.35 g 48 ${cy} Td (${this.esc(line)}) Tj ET`); cy -= 12; }
        if (settings?.email) { c.push(`BT /F1 8.5 Tf 0.35 g 48 ${cy} Td (${this.esc(String(settings.email))}) Tj ET`); cy -= 12; }
        if (settings?.phone) c.push(`BT /F1 8.5 Tf 0.35 g 48 ${cy} Td (${this.esc(String(settings.phone))}) Tj ET`);

        c.push(`BT /F2 8 Tf 0.36 0.09 0.40 rg 48 615 Td (${this.esc('BILL TO')}) Tj ET`);
        c.push(`BT /F2 11 Tf 0.08 g 48 596 Td (${this.esc(String(invoice.bill_to_name || invoice.organization_name || 'Customer'))}) Tj ET`);
        let by = 580;
        if (invoice.bill_to_contact_name) { c.push(`BT /F1 8.8 Tf 0.35 g 48 ${by} Td (${this.esc(`Attn: ${invoice.bill_to_contact_name}`)}) Tj ET`); by -= 13; }
        for (const line of this.wrap(String(invoice.bill_to_address || ''), 48).slice(0, 3)) { c.push(`BT /F1 8.8 Tf 0.35 g 48 ${by} Td (${this.esc(line)}) Tj ET`); by -= 13; }
        if (invoice.bill_to_email) { c.push(`BT /F1 8.8 Tf 0.35 g 48 ${by} Td (${this.esc(String(invoice.bill_to_email))}) Tj ET`); by -= 13; }
        if (invoice.bill_to_phone) c.push(`BT /F1 8.8 Tf 0.35 g 48 ${by} Td (${this.esc(String(invoice.bill_to_phone))}) Tj ET`);

        const meta = [
          ['Invoice date', this.prettyDate(invoice.issue_date)],
          ['Payment due', this.prettyDate(invoice.due_date)],
          ['P.O./S.O.', invoice.po_number || '—'],
          ['Amount due', this.moneyText(invoice.balance_due, invoice.currency)],
        ];
        let my = 616;
        for (const [label, value] of meta) {
          c.push(`BT /F1 8.5 Tf 0.45 g 360 ${my} Td (${this.esc(label)}) Tj ET`);
          c.push(`BT /F2 9.5 Tf 0.08 g 450 ${my} Td (${this.esc(String(value))}) Tj ET`);
          my -= 22;
        }
      } else {
        c.push(`BT /F1 8.5 Tf 0.45 g 48 690 Td (${this.esc(`Continuation — ${invoice.invoice_number}`)}) Tj ET`);
      }

      const top = pageIndex === 0 ? 470 : 650;
      c.push('q', '0.965 0.95 0.97 rg', `44 ${top} 507 30 re f`, 'Q');
      c.push(`BT /F2 8.5 Tf 0.28 g 52 ${top + 11} Td (${this.esc('ITEM')}) Tj ET`);
      c.push(`BT /F2 8.5 Tf 0.28 g 344 ${top + 11} Td (${this.esc('QTY')}) Tj ET`);
      c.push(`BT /F2 8.5 Tf 0.28 g 405 ${top + 11} Td (${this.esc('PRICE')}) Tj ET`);
      c.push(`BT /F2 8.5 Tf 0.28 g 492 ${top + 11} Td (${this.esc('AMOUNT')}) Tj ET`);
      let y = top - 24;
      for (const item of items) {
        const itemName = this.wrap(String(item.name || ''), 38).slice(0, 2);
        c.push(`BT /F2 9 Tf 0.08 g 52 ${y} Td (${this.esc(itemName[0] || '')}) Tj ET`);
        if (itemName[1]) c.push(`BT /F1 8 Tf 0.3 g 52 ${y - 12} Td (${this.esc(itemName[1])}) Tj ET`);
        if (item.description) c.push(`BT /F1 7.6 Tf 0.45 g 52 ${y - (itemName[1] ? 24 : 14)} Td (${this.esc(this.wrap(String(item.description), 42)[0] || '')}) Tj ET`);
        c.push(`BT /F1 8.8 Tf 0.15 g 348 ${y} Td (${this.esc(this.trimNumber(item.quantity))}) Tj ET`);
        c.push(`BT /F1 8.8 Tf 0.15 g 398 ${y} Td (${this.esc(this.moneyPlain(item.unit_price))}) Tj ET`);
        c.push(`BT /F2 8.8 Tf 0.08 g 476 ${y} Td (${this.esc(this.moneyPlain(item.line_total))}) Tj ET`);
        if (Number(item.tax_rate) > 0) c.push(`BT /F1 7 Tf 0.48 g 404 ${y - 14} Td (${this.esc(`Tax ${this.trimNumber(item.tax_rate)}%`)}) Tj ET`);
        c.push('q', '0.9 G', '0.5 w', `48 ${y - 34} m 547 ${y - 34} l S`, 'Q');
        y -= 58;
      }

      if (pageIndex === itemChunks.length - 1) {
        let ty = Math.max(140, y - 8);
        const totals = [
          ['Subtotal', this.moneyText(invoice.subtotal, invoice.currency)],
          ...(Number(invoice.discount_amount) > 0 ? [['Discount', `- ${this.moneyText(invoice.discount_amount, invoice.currency)}`]] : []),
          ...(Number(invoice.tax_amount) > 0 ? [['Tax', this.moneyText(invoice.tax_amount, invoice.currency)]] : []),
          ['Total', this.moneyText(invoice.total_amount, invoice.currency)],
          ...(Number(invoice.amount_paid) > 0 ? [['Paid', `- ${this.moneyText(invoice.amount_paid, invoice.currency)}`]] : []),
          ['Amount due', this.moneyText(invoice.balance_due, invoice.currency)],
        ];
        for (const [label, value] of totals) {
          const strong = label === 'Total' || label === 'Amount due';
          c.push(`BT /${strong ? 'F2' : 'F1'} ${strong ? 10.5 : 9} Tf ${strong ? '0.08' : '0.35'} g 365 ${ty} Td (${this.esc(String(label))}) Tj ET`);
          c.push(`BT /${strong ? 'F2' : 'F1'} ${strong ? 10.5 : 9} Tf ${strong ? '0.08' : '0.2'} g 455 ${ty} Td (${this.esc(String(value))}) Tj ET`);
          ty -= strong ? 22 : 18;
        }

        const noteY = 108;
        let ny = noteY;
        if (invoice.notes_terms) {
          c.push(`BT /F2 8 Tf 0.36 0.09 0.40 rg 48 ${ny} Td (${this.esc('NOTES / TERMS')}) Tj ET`);
          const noteLines = this.wrap(String(invoice.notes_terms), 72).slice(0, 2);
          ny -= 15;
          for (const line of noteLines) { c.push(`BT /F1 7.4 Tf 0.36 g 48 ${ny} Td (${this.esc(line)}) Tj ET`); ny -= 10; }
          ny -= 3;
        }
        const paymentLines = [
          settings?.naira_account ? `Account number: ${settings.naira_account}` : '',
          settings?.bank_name ? `Bank: ${settings.bank_name}` : '',
          settings?.bank_account_name ? `Account name: ${settings.bank_account_name}` : '',
          settings?.usd_account ? `USD account: ${settings.usd_account}` : '',
        ].filter(Boolean);
        if (paymentLines.length) {
          c.push(`BT /F2 8 Tf 0.36 0.09 0.40 rg 48 ${ny} Td (${this.esc('PAYMENT DETAILS')}) Tj ET`);
          ny -= 14;
          for (const line of paymentLines.slice(0, 4)) { c.push(`BT /F1 7.3 Tf 0.36 g 48 ${ny} Td (${this.esc(line)}) Tj ET`); ny -= 10; }
        }
      }

      c.push('q', '0.36 0.09 0.40 RG', '1.2 w', '44 44 m 551 44 l S', 'Q');
      c.push(`BT /F1 7 Tf 0.45 g 48 28 Td (${this.esc(`${settings?.organization_name || 'PlanoraHub'} · Invoice ${invoice.invoice_number}`)}) Tj ET`);
      c.push(`BT /F1 7 Tf 0.5 g 495 28 Td (${this.esc(`Page ${pageIndex + 1}/${itemChunks.length}`)}) Tj ET`);

      const stream = c.join('\n');
      objects[contentObj] = `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`;
      objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo ${logoObj} 0 R >> >> /Contents ${contentObj} 0 R >>`;
    });

    objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (let i = 1; i < objects.length; i += 1) {
      if (!objects[i]) continue;
      offsets[i] = Buffer.byteLength(pdf, 'latin1');
      pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objects.length; i += 1) pdf += `${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, 'latin1');
  }

  private money(value: any) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) throw new BadRequestException('Enter a valid amount');
    return this.round(n);
  }
  private round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
  private integer(value: any, fallback: number) { const n = Number(value); return Number.isFinite(n) ? Math.round(n) : fallback; }
  private clean(value: any) { const s = String(value ?? '').trim(); return s || null; }
  private validDate(value: any) { const s = String(value ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }
  private dateOnly(value: any) { return String(value ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10); }
  private addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  private prettyDate(value: any) { const raw = this.dateOnly(value); const d = new Date(`${raw}T12:00:00Z`); return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d); }
  private trimNumber(value: any) { const n = Number(value || 0); return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); }
  private moneyPlain(value: any) { return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  private moneyText(value: any, currency = 'NGN') { return `${String(currency || 'NGN').toUpperCase()} ${this.moneyPlain(value)}`; }
  private wrap(text: string, width = 76) { const lines: string[] = []; for (const paragraph of String(text || '').split(/\r?\n/)) { if (!paragraph.trim()) { lines.push(''); continue; } const words = paragraph.trim().split(/\s+/); let line = ''; for (const word of words) { if ((`${line} ${word}`).trim().length > width) { if (line) lines.push(line); line = word; } else line = (`${line} ${word}`).trim(); } if (line) lines.push(line); } return lines; }
  private esc(value: string) { return String(value).replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
}
