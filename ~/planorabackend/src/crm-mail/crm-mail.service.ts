import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { StaffMailService } from '../mailer/staff-mail.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';

type Actor = { id: string; roleCode: string; email: string };
type Ctx = { actorUserId?: string; ipAddress?: string; userAgent?: string };

type MailFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class CrmMailService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mailer: StaffMailService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async summary(actor: Actor) {
    const admin = actor.roleCode === 'SUPER_ADMIN';
    const params = [actor.id, admin];
    const visible = this.visibilitySql('t', '$1', '$2');
    const [counts, contexts, staff, draftCount, templates] = await Promise.all([
      this.db.query(`SELECT
        COUNT(*)::int total,
        COUNT(*) FILTER(WHERE t.created_by_id=$1)::int mine,
        COUNT(*) FILTER(WHERE t.created_by_id<>$1 AND EXISTS(SELECT 1 FROM crm_mail_thread_access a WHERE a.thread_id=t.id AND a.user_id=$1))::int granted,
        COUNT(*) FILTER(WHERE EXISTS(SELECT 1 FROM crm_mail_messages m WHERE m.thread_id=t.id AND m.direction='INBOUND'))::int inbound
        FROM crm_mail_threads t WHERE ${visible}`, params),
      this.db.query(`SELECT l.id,o.name title,l.record_type::text record_type,l.stage::text stage,
        l.assigned_to_id,l.assigned_team_id
        FROM leads l JOIN organizations o ON o.id=l.organization_id
        WHERE l.record_type IN('LEAD','PROSPECT','CLIENT') AND ($2::boolean OR l.assigned_to_id=$1 OR EXISTS(
          SELECT 1 FROM team_members tm WHERE tm.user_id=$1 AND tm.team_id=l.assigned_team_id
        )) ORDER BY o.name LIMIT 500`, params),
      admin
        ? this.db.query(`SELECT id,first_name,last_name,email,job_title FROM users WHERE status IN('ACTIVE','INVITED') ORDER BY first_name,last_name`)
        : Promise.resolve({ rows: [] as any[] }),
      this.db.query(`SELECT COUNT(*)::int count FROM crm_mail_drafts WHERE created_by_id=$1`, [actor.id]),
      this.db.query(`SELECT id,name,description,is_default,is_active FROM crm_mail_templates WHERE is_active=true ORDER BY is_default DESC,name`),
    ]);
    return {
      configured: Boolean(this.config.get<string>('RESEND_API_KEY')?.trim() && this.config.get<string>('RESEND_FROM_EMAIL')?.trim()),
      fromEmail: this.config.get<string>('RESEND_FROM_EMAIL')?.trim() || null,
      counts: { ...(counts.rows[0] || { total: 0, mine: 0, granted: 0, inbound: 0 }), drafts: draftCount.rows[0]?.count || 0 },
      contexts: contexts.rows,
      staff: staff.rows,
      templates: templates.rows,
    };
  }

  async threads(actor: Actor, box = 'all', query = '') {
    const admin = actor.roleCode === 'SUPER_ADMIN';
    const visible = this.visibilitySql('t', '$1', '$2');
    const q = `%${query.trim()}%`;
    const boxSql =
      box === 'mine'
        ? `AND t.created_by_id=$1`
        : box === 'shared'
          ? `AND t.created_by_id<>$1 AND (${admin ? 'TRUE' : `EXISTS(SELECT 1 FROM crm_mail_thread_access a WHERE a.thread_id=t.id AND a.user_id=$1) OR EXISTS(SELECT 1 FROM leads l JOIN team_members tm ON tm.team_id=l.assigned_team_id WHERE l.id=t.lead_id AND tm.user_id=$1)`})`
          : box === 'inbox'
            ? `AND EXISTS(SELECT 1 FROM crm_mail_messages im WHERE im.thread_id=t.id AND im.direction='INBOUND')`
            : '';
    const result = await this.db.query(`SELECT t.*,
      u.first_name creator_first_name,u.last_name creator_last_name,
      o.name organization_name,l.record_type::text record_type,
      (SELECT m.direction FROM crm_mail_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) last_direction,
      (SELECT LEFT(COALESCE(m.body_text,''),180) FROM crm_mail_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) snippet,
      (SELECT COUNT(*)::int FROM crm_mail_messages m WHERE m.thread_id=t.id) message_count
      FROM crm_mail_threads t
      LEFT JOIN users u ON u.id=t.created_by_id
      LEFT JOIN leads l ON l.id=t.lead_id
      LEFT JOIN organizations o ON o.id=l.organization_id
      WHERE ${visible} ${boxSql}
        AND ($3='' OR CONCAT_WS(' ',t.subject,o.name,array_to_string(t.recipient_emails,' '),u.first_name,u.last_name) ILIKE $4)
      ORDER BY t.last_message_at DESC LIMIT 250`, [actor.id, admin, query.trim(), q]);
    return result.rows;
  }

  async thread(actor: Actor, id: string) {
    await this.assertThreadAccess(actor, id);
    const thread = (await this.db.query(`SELECT t.*,u.first_name creator_first_name,u.last_name creator_last_name,
      o.name organization_name,l.record_type::text record_type,l.assigned_to_id,l.assigned_team_id
      FROM crm_mail_threads t LEFT JOIN users u ON u.id=t.created_by_id
      LEFT JOIN leads l ON l.id=t.lead_id LEFT JOIN organizations o ON o.id=l.organization_id
      WHERE t.id=$1`, [id])).rows[0];
    if (!thread) throw new NotFoundException('Mail thread not found');
    const messages = (await this.db.query(`SELECT m.*,u.first_name sender_first_name,u.last_name sender_last_name,
      COALESCE(json_agg(json_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'file_size',a.file_size)) FILTER(WHERE a.id IS NOT NULL),'[]') attachments
      FROM crm_mail_messages m LEFT JOIN users u ON u.id=m.sender_user_id
      LEFT JOIN crm_mail_attachments a ON a.message_id=m.id
      WHERE m.thread_id=$1 GROUP BY m.id,u.first_name,u.last_name ORDER BY m.created_at`, [id])).rows;
    const grants = actor.roleCode === 'SUPER_ADMIN'
      ? (await this.db.query(`SELECT a.user_id,u.first_name,u.last_name,u.email FROM crm_mail_thread_access a JOIN users u ON u.id=a.user_id WHERE a.thread_id=$1 ORDER BY u.first_name,u.last_name`, [id])).rows
      : [];
    return { thread, messages, grants };
  }


  async drafts(actor: Actor) {
    return (await this.db.query(`SELECT d.*,o.name organization_name,l.record_type::text record_type,t.name template_name
      FROM crm_mail_drafts d LEFT JOIN leads l ON l.id=d.lead_id LEFT JOIN organizations o ON o.id=l.organization_id
      LEFT JOIN crm_mail_templates t ON t.id=d.template_id
      WHERE d.created_by_id=$1 ORDER BY d.updated_at DESC`, [actor.id])).rows;
  }

  async saveDraft(actor: Actor, id: string | null, body: any, ctx?: Ctx) {
    const to = this.parseEmails(body.to || '');
    const cc = this.parseEmails(body.cc || '');
    const leadId = String(body.leadId || '').trim() || null;
    const templateId = String(body.templateId || '').trim() || null;
    if (leadId) await this.contextRecord(actor, leadId);
    if (templateId) await this.templateById(templateId);

    if (id) {
      const before = (await this.db.query(
        `SELECT id,subject,lead_id,template_id,recipient_emails,cc_emails FROM crm_mail_drafts WHERE id=$1 AND created_by_id=$2`,
        [id, actor.id],
      )).rows[0];
      if (!before) throw new NotFoundException('Draft not found');
      const row = (await this.db.query(
        `UPDATE crm_mail_drafts
         SET sender_label=$3,recipient_emails=$4,cc_emails=$5,subject=$6,body_text=$7,lead_id=$8,template_id=$9,updated_at=NOW()
         WHERE id=$1 AND created_by_id=$2 RETURNING *`,
        [id, actor.id, String(body.senderName || '').trim() || null, to, cc, String(body.subject || ''), String(body.body || ''), leadId, templateId],
      )).rows[0];
      await this.audit.log({
        actorUserId: actor.id,
        action: 'MAIL_DRAFT_UPDATED',
        module: 'communications',
        entityType: 'mail_draft',
        entityId: id,
        oldValues: { subject: before.subject, leadId: before.lead_id, templateId: before.template_id, recipientCount: (before.recipient_emails || []).length, ccCount: (before.cc_emails || []).length },
        newValues: { subject: row.subject, leadId: row.lead_id, templateId: row.template_id, recipientCount: (row.recipient_emails || []).length, ccCount: (row.cc_emails || []).length },
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      });
      return row;
    }

    const row = (await this.db.query(
      `INSERT INTO crm_mail_drafts(created_by_id,sender_label,recipient_emails,cc_emails,subject,body_text,lead_id,template_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [actor.id, String(body.senderName || '').trim() || null, to, cc, String(body.subject || ''), String(body.body || ''), leadId, templateId],
    )).rows[0];
    await this.audit.log({
      actorUserId: actor.id,
      action: 'MAIL_DRAFT_CREATED',
      module: 'communications',
      entityType: 'mail_draft',
      entityId: row.id,
      newValues: { subject: row.subject, leadId: row.lead_id, templateId: row.template_id, recipientCount: (row.recipient_emails || []).length, ccCount: (row.cc_emails || []).length },
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });
    return row;
  }

  async deleteDraft(actor: Actor, id: string, ctx?: Ctx) {
    const row = (await this.db.query(
      `DELETE FROM crm_mail_drafts WHERE id=$1 AND created_by_id=$2 RETURNING id,subject,lead_id,template_id,recipient_emails`,
      [id, actor.id],
    )).rows[0];
    if (!row) throw new NotFoundException('Draft not found');
    await this.audit.log({
      actorUserId: actor.id,
      action: 'MAIL_DRAFT_DELETED',
      module: 'communications',
      entityType: 'mail_draft',
      entityId: id,
      oldValues: { subject: row.subject, leadId: row.lead_id, templateId: row.template_id, recipientCount: (row.recipient_emails || []).length },
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });
    return true;
  }

  async templates(actor: Actor) {
    const admin = actor.roleCode === 'SUPER_ADMIN';
    return (await this.db.query(
      `SELECT t.*,u.first_name,u.last_name FROM crm_mail_templates t LEFT JOIN users u ON u.id=t.created_by_id WHERE $1::boolean OR t.is_active=true ORDER BY t.is_default DESC,t.is_active DESC,t.name`,
      [admin],
    )).rows;
  }

  async createTemplate(actor: Actor, body: any, ctx?: Ctx) {
    if (actor.roleCode !== 'SUPER_ADMIN') throw new ForbiddenException('Only Super Admin can manage mail templates');
    const name = String(body.name || '').trim();
    const html = String(body.html || '').trim();
    if (!name || !html) throw new BadRequestException('Template name and HTML are required');
    if (!html.includes('{{body}}')) throw new BadRequestException('Template HTML must include {{body}}');
    const row = (await this.db.query(
      `INSERT INTO crm_mail_templates(name,description,html,is_default,is_active,created_by_id) VALUES($1,$2,$3,false,true,$4) RETURNING *`,
      [name, String(body.description || '').trim() || null, html, actor.id],
    )).rows[0];
    await this.audit.log({
      actorUserId: actor.id,
      action: 'MAIL_TEMPLATE_CREATED',
      module: 'communications',
      entityType: 'mail_template',
      entityId: row.id,
      newValues: { name: row.name, isDefault: row.is_default, isActive: row.is_active },
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });
    return row;
  }

  async updateTemplate(actor: Actor, id: string, body: any, ctx?: Ctx) {
    if (actor.roleCode !== 'SUPER_ADMIN') throw new ForbiddenException('Only Super Admin can manage mail templates');
    const current = await this.templateById(id);
    const html = body.html === undefined ? current.html : String(body.html || '').trim();
    if (!html.includes('{{body}}')) throw new BadRequestException('Template HTML must include {{body}}');
    if (body.isDefault === true) await this.db.query(`UPDATE crm_mail_templates SET is_default=false WHERE id<>$1`, [id]);
    const row = (await this.db.query(
      `UPDATE crm_mail_templates SET name=COALESCE(NULLIF($2,''),name),description=$3,html=$4,is_default=COALESCE($5,is_default),is_active=COALESCE($6,is_active),updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id, String(body.name ?? '').trim(), body.description === undefined ? current.description : String(body.description || '').trim() || null, html, body.isDefault ?? null, body.isActive ?? null],
    )).rows[0];
    await this.audit.log({
      actorUserId: actor.id,
      action: 'MAIL_TEMPLATE_UPDATED',
      module: 'communications',
      entityType: 'mail_template',
      entityId: id,
      oldValues: { name: current.name, isDefault: current.is_default, isActive: current.is_active },
      newValues: { name: row.name, isDefault: row.is_default, isActive: row.is_active },
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });
    return row;
  }

  private async templateById(id:string|null){
    if(id){const row=(await this.db.query(`SELECT * FROM crm_mail_templates WHERE id=$1 AND is_active=true`,[id])).rows[0];if(row)return row;throw new BadRequestException('Mail template is unavailable')}
    const row=(await this.db.query(`SELECT * FROM crm_mail_templates WHERE is_default=true AND is_active=true ORDER BY created_at LIMIT 1`)).rows[0];
    if(!row)throw new BadRequestException('No active default mail template is configured');return row;
  }

  async send(actor: Actor, body: any, files: MailFile[], ctx?: Ctx) {
    const to = this.parseEmails(body.to);
    const cc = this.parseEmails(body.cc || '');
    const subject = String(body.subject || '').trim();
    const message = String(body.body || '').trim();
    const leadId = String(body.leadId || '').trim() || null;
    const senderName = String(body.senderName || '').trim() || await this.actorName(actor.id);
    const template = await this.templateById(String(body.templateId || '').trim() || null);
    if (!to.length) throw new BadRequestException('Add at least one recipient email');
    if (!subject) throw new BadRequestException('Subject is required');
    if (!message) throw new BadRequestException('Email body is required');
    if (files.length > 5) throw new BadRequestException('Attach up to 5 files');
    for (const file of files) if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Each attachment must be 10 MB or smaller');

    let teamId: string | null = null;
    if (leadId) {
      const lead = await this.contextRecord(actor, leadId);
      teamId = lead.assigned_team_id || null;
    }

    const c = await this.db.getClient();
    try {
      await c.query('BEGIN');
      const thread = (await c.query(`INSERT INTO crm_mail_threads(subject,created_by_id,lead_id,team_id,recipient_emails,cc_emails,sender_label,template_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [subject, actor.id, leadId, teamId, to, cc, senderName, template.id])).rows[0];
      const delivery = await this.mailer.sendWorkspaceMail({
        to, cc, subject, body: message, senderName,
        attachments: files.map((file) => ({ filename: file.originalname, content: file.buffer.toString('base64'), contentType: file.mimetype })),
        idempotencyKey: `crm-mail/${thread.id}/initial`,
        headers: { 'X-PlanoraHub-Thread': thread.id }, templateHtml: template.html,
      });
      if (delivery.status !== 'SENT') throw new BadRequestException(delivery.message);
      const mailRow = (await c.query(`INSERT INTO crm_mail_messages(thread_id,sender_user_id,direction,provider_email_id,provider_message_id,from_email,to_emails,cc_emails,subject,body_text,delivery_status)
        VALUES($1,$2,'OUTBOUND',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [thread.id, actor.id, delivery.id || null, delivery.messageId || null, this.config.get<string>('RESEND_FROM_EMAIL')?.trim() || null, to, cc, subject, message, delivery.status])).rows[0];
      await this.storeAttachments(c, thread.id, mailRow.id, files);
      await c.query(`UPDATE crm_mail_threads SET last_message_at=NOW(),updated_at=NOW() WHERE id=$1`, [thread.id]);
      if(body.draftId)await c.query(`DELETE FROM crm_mail_drafts WHERE id=$1 AND created_by_id=$2`,[body.draftId,actor.id]);
      await c.query('COMMIT');
      await this.audit.log({ actorUserId: actor.id, action: 'CRM_EMAIL_SENT', module: 'communications', entityType: 'mail_thread', entityId: thread.id, newValues: { subject, to, leadId }, ipAddress: ctx?.ipAddress, userAgent: ctx?.userAgent });
      return this.thread(actor, thread.id);
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  async reply(actor: Actor, threadId: string, body: any, files: MailFile[], ctx?: Ctx) {
    await this.assertThreadAccess(actor, threadId);
    const thread = (await this.db.query(`SELECT * FROM crm_mail_threads WHERE id=$1`, [threadId])).rows[0];
    if (!thread) throw new NotFoundException('Mail thread not found');
    const message = String(body.body || '').trim();
    if (!message) throw new BadRequestException('Reply body is required');
    const senderName = String(body.senderName || '').trim() || await this.actorName(actor.id);
    const lastProvider = (await this.db.query(`SELECT provider_email_id,provider_message_id FROM crm_mail_messages WHERE thread_id=$1 AND direction='OUTBOUND' ORDER BY created_at DESC LIMIT 1`, [threadId])).rows[0];
    let providerMessageId = lastProvider?.provider_message_id || null;
    if (!providerMessageId && lastProvider?.provider_email_id) providerMessageId = await this.sentMessageId(lastProvider.provider_email_id);
    const template = await this.templateById(thread.template_id || null);
    const headers: Record<string, string> = { 'X-PlanoraHub-Thread': threadId };
    if (providerMessageId) {
      headers['In-Reply-To'] = providerMessageId;
      headers['References'] = providerMessageId;
    }
    const delivery = await this.mailer.sendWorkspaceMail({
      to: thread.recipient_emails || [], cc: thread.cc_emails || [], subject: thread.subject, body: message, senderName,
      attachments: files.map((file) => ({ filename: file.originalname, content: file.buffer.toString('base64'), contentType: file.mimetype })),
      idempotencyKey: `crm-mail/${threadId}/reply/${Date.now()}`,
      headers, templateHtml: template.html,
    });
    if (delivery.status !== 'SENT') throw new BadRequestException(delivery.message);
    const row = (await this.db.query(`INSERT INTO crm_mail_messages(thread_id,sender_user_id,direction,provider_email_id,provider_message_id,from_email,to_emails,cc_emails,subject,body_text,delivery_status)
      VALUES($1,$2,'OUTBOUND',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [threadId, actor.id, delivery.id || null, delivery.messageId || null, this.config.get<string>('RESEND_FROM_EMAIL')?.trim() || null, thread.recipient_emails || [], thread.cc_emails || [], thread.subject, message, delivery.status])).rows[0];
    await this.storeAttachments(this.db, threadId, row.id, files);
    await this.db.query(`UPDATE crm_mail_threads SET last_message_at=NOW(),updated_at=NOW() WHERE id=$1`, [threadId]);
    await this.audit.log({ actorUserId: actor.id, action: 'CRM_EMAIL_REPLIED', module: 'communications', entityType: 'mail_thread', entityId: threadId, newValues: { recipients: thread.recipient_emails }, ipAddress: ctx?.ipAddress, userAgent: ctx?.userAgent });
    return this.thread(actor, threadId);
  }

  async grantAccess(actor: Actor, threadId: string, userIds: string[], ctx?: Ctx) {
    if (actor.roleCode !== 'SUPER_ADMIN') throw new ForbiddenException('Only Super Admin can grant mail access');
    const thread = (await this.db.query(`SELECT id FROM crm_mail_threads WHERE id=$1`, [threadId])).rows[0];
    if (!thread) throw new NotFoundException('Mail thread not found');
    await this.db.query(`DELETE FROM crm_mail_thread_access WHERE thread_id=$1`, [threadId]);
    for (const id of [...new Set(userIds.filter(Boolean))]) {
      await this.db.query(`INSERT INTO crm_mail_thread_access(thread_id,user_id,granted_by_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [threadId, id, actor.id]);
    }
    await this.audit.log({ actorUserId: actor.id, action: 'CRM_EMAIL_ACCESS_UPDATED', module: 'communications', entityType: 'mail_thread', entityId: threadId, newValues: { userIds }, ipAddress: ctx?.ipAddress, userAgent: ctx?.userAgent });
    return this.thread(actor, threadId);
  }

  async attachment(actor: Actor, id: string, ctx?: Ctx) {
    const row = (await this.db.query(`SELECT a.*,m.thread_id FROM crm_mail_attachments a JOIN crm_mail_messages m ON m.id=a.message_id WHERE a.id=$1`, [id])).rows[0];
    if (!row) throw new NotFoundException('Attachment not found');
    await this.assertThreadAccess(actor, row.thread_id);
    const signed = await this.supabase.admin.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 300);
    if (signed.error) throw new BadRequestException('Unable to open attachment');
    await this.audit.log({
      actorUserId: actor.id,
      action: 'MAIL_ATTACHMENT_OPENED',
      module: 'communications',
      entityType: 'mail_attachment',
      entityId: id,
      newValues: { threadId: row.thread_id, fileName: row.file_name, fileSize: row.file_size },
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });
    return { url: signed.data.signedUrl, fileName: row.file_name };
  }

  async handleResendWebhook(token: string | undefined, event: any) {
    const expected = this.config.get<string>('RESEND_WEBHOOK_TOKEN')?.trim();
    if (!expected) throw new UnauthorizedException('Resend webhook token is not configured');
    if (token !== expected) throw new UnauthorizedException('Invalid webhook token');
    const type = String(event?.type || '');
    const data = event?.data || {};
    if (type === 'email.sent' && data.email_id) {
      await this.db.query(`UPDATE crm_mail_messages SET provider_message_id=COALESCE($2,provider_message_id) WHERE provider_email_id=$1`, [data.email_id, data.message_id || null]);
      return { accepted: true };
    }
    if (type !== 'email.received' || !data.email_id) return { accepted: true };
    if ((await this.db.query(`SELECT 1 FROM crm_mail_messages WHERE provider_email_id=$1 LIMIT 1`, [data.email_id])).rowCount) return { accepted: true };
    const details = await this.receivedEmail(data.email_id);
    const subject = String(details?.subject || data.subject || '(No subject)').trim();
    const from = this.emailOnly(String(details?.from || data.from || ''));
    const headers = (details?.headers || {}) as Record<string, string>;
    const inReplyTo = headers['in-reply-to'] || headers['In-Reply-To'] || null;
    let thread: any = null;
    if (inReplyTo) {
      thread = (await this.db.query(`SELECT t.* FROM crm_mail_threads t JOIN crm_mail_messages m ON m.thread_id=t.id WHERE m.provider_message_id=$1 ORDER BY t.last_message_at DESC LIMIT 1`, [inReplyTo])).rows[0];
    }
    if (!thread) {
      const cleanSubject = this.cleanSubject(subject);
      thread = (await this.db.query(`SELECT * FROM crm_mail_threads WHERE LOWER(subject)=LOWER($1) AND $2=ANY(recipient_emails) ORDER BY last_message_at DESC LIMIT 1`, [cleanSubject, from])).rows[0];
    }
    if (!thread) {
      thread = (await this.db.query(`INSERT INTO crm_mail_threads(subject,recipient_emails,status,last_message_at) VALUES($1,$2,'OPEN',NOW()) RETURNING *`, [this.cleanSubject(subject), from ? [from] : []])).rows[0];
    }
    const text = String(details?.text || this.stripHtml(details?.html || '') || 'Inbound email received.').trim();
    const inbound = (await this.db.query(`INSERT INTO crm_mail_messages(thread_id,direction,provider_email_id,provider_message_id,from_email,to_emails,cc_emails,subject,body_text,delivery_status,created_at)
      VALUES($1,'INBOUND',$2,$3,$4,$5,$6,$7,$8,'RECEIVED',COALESCE($9::timestamptz,NOW())) RETURNING *`, [thread.id, data.email_id, details?.message_id || data.message_id || null, from || null, details?.to || data.to || [], details?.cc || data.cc || [], subject, text, details?.created_at || data.created_at || null])).rows[0];
    await this.storeInboundAttachments(thread.id, inbound.id, data.email_id, details?.attachments || data.attachments || []);
    await this.db.query(`UPDATE crm_mail_threads SET last_message_at=NOW(),updated_at=NOW() WHERE id=$1`, [thread.id]);
    await this.notifyInboundReply(thread.id, from, subject);
    await this.audit.log({ action: 'CRM_EMAIL_RECEIVED', module: 'communications', entityType: 'mail_thread', entityId: thread.id, newValues: { from, subject } });
    return { accepted: true, threadId: thread.id };
  }


  private async notifyInboundReply(threadId: string, from: string, subject: string) {
    await this.db.query(`INSERT INTO notifications(user_id,title,body,kind,href)
      SELECT DISTINCT u.id,'Email reply received',$2,'MAIL','/email'
      FROM users u
      JOIN roles r ON r.id=u.role_id
      WHERE u.status='ACTIVE' AND (
        r.code='SUPER_ADMIN'
        OR EXISTS(SELECT 1 FROM crm_mail_threads t WHERE t.id=$1 AND t.created_by_id=u.id)
        OR EXISTS(SELECT 1 FROM crm_mail_thread_access a WHERE a.thread_id=$1 AND a.user_id=u.id)
        OR EXISTS(SELECT 1 FROM crm_mail_threads t JOIN leads l ON l.id=t.lead_id WHERE t.id=$1 AND l.assigned_to_id=u.id)
        OR EXISTS(SELECT 1 FROM crm_mail_threads t JOIN leads l ON l.id=t.lead_id JOIN team_members tm ON tm.team_id=l.assigned_team_id WHERE t.id=$1 AND tm.user_id=u.id)
        OR EXISTS(SELECT 1 FROM crm_mail_threads t JOIN team_members tm ON tm.team_id=t.team_id WHERE t.id=$1 AND tm.user_id=u.id)
      )`, [threadId, `${from || 'An external contact'} replied to ${subject}.`]);
  }

  private async storeInboundAttachments(threadId: string, messageId: string, emailId: string, attachments: any[]) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey || !Array.isArray(attachments) || !attachments.length) return;
    for (const attachment of attachments) {
      const attachmentId = String(attachment?.id || '').trim();
      if (!attachmentId) continue;
      try {
        const metaResponse = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!metaResponse.ok) continue;
        const meta = (await metaResponse.json().catch(() => ({}))) as any;
        if (!meta?.download_url) continue;
        const fileResponse = await fetch(meta.download_url);
        if (!fileResponse.ok) continue;
        const bytes = Buffer.from(await fileResponse.arrayBuffer());
        const fileName = String(meta.filename || attachment.filename || 'attachment');
        const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `mail/${threadId}/${randomUUID()}-${safe}`;
        const contentType = String(meta.content_type || attachment.content_type || 'application/octet-stream');
        const upload = await this.supabase.admin.storage.from('task-attachments').upload(path, bytes, { contentType, upsert: false });
        if (upload.error) continue;
        await this.db.query(`INSERT INTO crm_mail_attachments(message_id,file_name,mime_type,file_size,storage_path) VALUES($1,$2,$3,$4,$5)`, [messageId, fileName, contentType, Number(meta.size || bytes.length), path]);
      } catch {
        // An attachment failure should not reject the email itself.
      }
    }
  }

  private async assertThreadAccess(actor: Actor, threadId: string) {
    if (actor.roleCode === 'SUPER_ADMIN') return true;
    const result = await this.db.query(`SELECT 1 FROM crm_mail_threads t WHERE t.id=$1 AND ${this.visibilitySql('t', '$2', 'FALSE')} LIMIT 1`, [threadId, actor.id]);
    if (!result.rowCount) throw new ForbiddenException('You do not have access to this mail thread');
    return true;
  }

  private visibilitySql(alias: string, userParam: string, adminParam: string) {
    return `(${adminParam}::boolean OR ${alias}.created_by_id=${userParam} OR EXISTS(
      SELECT 1 FROM crm_mail_thread_access a WHERE a.thread_id=${alias}.id AND a.user_id=${userParam}
    ) OR EXISTS(
      SELECT 1 FROM leads l WHERE l.id=${alias}.lead_id AND (l.assigned_to_id=${userParam} OR EXISTS(
        SELECT 1 FROM team_members tm WHERE tm.user_id=${userParam} AND tm.team_id=l.assigned_team_id
      ))
    ) OR EXISTS(
      SELECT 1 FROM team_members tm WHERE tm.user_id=${userParam} AND tm.team_id=${alias}.team_id
    ))`;
  }

  private async contextRecord(actor: Actor, id: string) {
    const admin = actor.roleCode === 'SUPER_ADMIN';
    const row = (await this.db.query(`SELECT l.id,l.assigned_team_id,l.assigned_to_id FROM leads l WHERE l.id=$1 AND ($3::boolean OR l.assigned_to_id=$2 OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.user_id=$2 AND tm.team_id=l.assigned_team_id))`, [id, actor.id, admin])).rows[0];
    if (!row) throw new ForbiddenException('You do not have access to that CRM record');
    return row;
  }

  private parseEmails(value: unknown) {
    return [...new Set(String(value || '').split(/[;,\n]/).map((part) => part.trim().toLowerCase()).filter((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)))];
  }

  private emailOnly(value: string) {
    const match = value.match(/<([^>]+)>/);
    return (match?.[1] || value).trim().toLowerCase();
  }

  private cleanSubject(value: string) {
    return value.replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, '').trim();
  }

  private stripHtml(value: string) {
    return String(value || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }

  private async actorName(userId: string) {
    const row = (await this.db.query(`SELECT first_name,last_name FROM users WHERE id=$1`, [userId])).rows[0];
    return [row?.first_name, row?.last_name].filter(Boolean).join(' ') || 'PlanoraHub';
  }

  private async sentMessageId(emailId: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) return null;
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
    if (!response?.ok) return null;
    const body = (await response.json().catch(() => ({}))) as any;
    if (body?.message_id) await this.db.query(`UPDATE crm_mail_messages SET provider_message_id=$2 WHERE provider_email_id=$1`, [emailId, body.message_id]);
    return body?.message_id || null;
  }

  private async receivedEmail(emailId: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) return null;
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
    if (!response?.ok) return null;
    return response.json().catch(() => null);
  }

  private async storeAttachments(client: any, threadId: string, messageId: string, files: MailFile[]) {
    for (const file of files) {
      const safe = String(file.originalname || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `mail/${threadId}/${randomUUID()}-${safe}`;
      const upload = await this.supabase.admin.storage.from('task-attachments').upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
      if (upload.error) throw new BadRequestException(`Unable to store attachment ${file.originalname}`);
      await client.query(`INSERT INTO crm_mail_attachments(message_id,file_name,mime_type,file_size,storage_path) VALUES($1,$2,$3,$4,$5)`, [messageId, file.originalname, file.mimetype, file.size, path]);
    }
  }
}
