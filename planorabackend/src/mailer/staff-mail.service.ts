import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MailDelivery = {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  id?: string;
  messageId?: string;
  message: string;
};

type StaffMailInput = {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  roleName: string;
  departmentName?: string | null;
  teamNames?: string[];
};

export type WorkspaceAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

@Injectable()
export class StaffMailService {
  constructor(private readonly config: ConfigService) {}

  async sendWelcome(input: StaffMailInput): Promise<MailDelivery> {
    const loginUrl = this.loginUrl();
    return this.send({
      to: input.email,
      subject: 'Your PlanoraHub CRM account is ready',
      idempotencyKey: `staff-welcome/${input.email}/${Date.now()}`,
      html: this.shell(`
        <p style="margin:0 0 14px">Hello ${this.escape(input.firstName)},</p>
        <p style="margin:0 0 18px;line-height:1.6">Your PlanoraHub CRM staff account has been created. Use the credentials below to sign in. You will be required to create a new password before you can access your workspace.</p>
        ${this.credentials(input)}
        <p style="margin:22px 0 0"><a href="${this.escape(loginUrl)}" style="display:inline-block;background:#6f2c7f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Open PlanoraHub CRM</a></p>
        <p style="margin:20px 0 0;color:#6f6571;font-size:13px;line-height:1.6">For your security, do not forward this message. Your temporary password stops working after you change it.</p>
      `),
    });
  }

  async sendPasswordReset(input: StaffMailInput): Promise<MailDelivery> {
    const loginUrl = this.loginUrl();
    return this.send({
      to: input.email,
      subject: 'Your PlanoraHub CRM temporary password was reset',
      idempotencyKey: `staff-password-reset/${input.email}/${Date.now()}`,
      html: this.shell(`
        <p style="margin:0 0 14px">Hello ${this.escape(input.firstName)},</p>
        <p style="margin:0 0 18px;line-height:1.6">An administrator reset your PlanoraHub CRM password. Use the temporary password below to sign in. You must choose a new password before continuing to the CRM.</p>
        ${this.credentials(input)}
        <p style="margin:22px 0 0"><a href="${this.escape(loginUrl)}" style="display:inline-block;background:#6f2c7f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Sign in to PlanoraHub CRM</a></p>
        <p style="margin:20px 0 0;color:#6f6571;font-size:13px;line-height:1.6">If you were not expecting this reset, contact your PlanoraHub administrator.</p>
      `),
    });
  }

  async sendOperational(input: {
    to: string;
    firstName?: string | null;
    subject: string;
    title: string;
    message: string;
    ctaLabel?: string;
    ctaPath?: string;
    idempotencyKey?: string;
  }): Promise<MailDelivery> {
    const greeting = input.firstName?.trim()
      ? `<p style="margin:0 0 14px">Hello ${this.escape(input.firstName.trim())},</p>`
      : '';
    const cta = input.ctaPath
      ? `<p style="margin:22px 0 0"><a href="${this.escape(this.frontendUrl(input.ctaPath))}" style="display:inline-block;background:#6f2c7f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">${this.escape(input.ctaLabel || 'Open PlanoraHub CRM')}</a></p>`
      : '';
    return this.send({
      to: input.to,
      subject: input.subject,
      idempotencyKey:
        input.idempotencyKey ||
        `crm-operational/${input.to}/${Date.now()}`,
      html: this.shell(`
        ${greeting}
        <div style="font-size:20px;font-weight:800;margin:0 0 10px;color:#241f25">${this.escape(input.title)}</div>
        <p style="margin:0;line-height:1.65;color:#514a53">${this.escape(input.message)}</p>
        ${cta}
        <p style="margin:20px 0 0;color:#8a808b;font-size:12px;line-height:1.6">This is an operational notification from PlanoraHub CRM.</p>
      `),
    });
  }

  async sendWorkspaceMail(input: {
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    senderName?: string | null;
    attachments?: WorkspaceAttachment[];
    headers?: Record<string, string>;
    replyTo?: string;
    idempotencyKey: string;
    templateHtml?: string | null;
  }): Promise<MailDelivery> {
    const body = this.escape(input.body).replaceAll('\n', '<br/>');
    const html = input.templateHtml?.trim()
      ? this.renderWorkspaceTemplate(input.templateHtml, body, input.senderName || undefined)
      : this.workspaceShell(body, input.senderName || undefined);
    return this.send({
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      html,
      fromName: input.senderName || undefined,
      attachments: input.attachments,
      headers: input.headers,
      replyTo: input.replyTo || this.config.get<string>('RESEND_REPLY_TO_EMAIL')?.trim() || this.config.get<string>('RESEND_FROM_EMAIL')?.trim(),
      idempotencyKey: input.idempotencyKey,
    });
  }

  private credentials(input: StaffMailInput) {
    const teams = input.teamNames?.length ? input.teamNames.join(', ') : 'None';
    return `
      <div style="border:1px solid #e7dce9;border-radius:14px;background:#fbf8fc;padding:18px">
        <div style="margin-bottom:12px"><strong style="display:block;font-size:12px;color:#796e7b;text-transform:uppercase;letter-spacing:.05em">Login email</strong><span>${this.escape(input.email)}</span></div>
        <div style="margin-bottom:12px"><strong style="display:block;font-size:12px;color:#796e7b;text-transform:uppercase;letter-spacing:.05em">Temporary password</strong><span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700">${this.escape(input.temporaryPassword)}</span></div>
        <div style="margin-bottom:12px"><strong style="display:block;font-size:12px;color:#796e7b;text-transform:uppercase;letter-spacing:.05em">Role</strong><span>${this.escape(input.roleName)}</span></div>
        <div style="margin-bottom:12px"><strong style="display:block;font-size:12px;color:#796e7b;text-transform:uppercase;letter-spacing:.05em">Department</strong><span>${this.escape(input.departmentName || 'Not assigned')}</span></div>
        <div><strong style="display:block;font-size:12px;color:#796e7b;text-transform:uppercase;letter-spacing:.05em">Team${input.teamNames?.length === 1 ? '' : 's'}</strong><span>${this.escape(teams)}</span></div>
      </div>
    `;
  }

  private shell(content: string) {
    return `<!doctype html><html><body style="margin:0;background:#f6f3f7;font-family:Inter,Arial,sans-serif;color:#241f25"><div style="max-width:620px;margin:0 auto;padding:34px 18px"><div style="background:#fff;border:1px solid #eadfeb;border-radius:18px;overflow:hidden"><div style="height:5px;background:linear-gradient(90deg,#6f2c7f,#a66ab4)"></div><div style="padding:26px"><div style="font-weight:800;font-size:20px;color:#6f2c7f;margin-bottom:24px">PlanoraHub CRM</div>${content}</div></div><p style="text-align:center;color:#8a808b;font-size:12px;margin:16px 0 0">PlanoraHub · Staff Operations</p></div></body></html>`;
  }


  private renderWorkspaceTemplate(template: string, body: string, senderName?: string) {
    const sender = senderName ? `Sent by ${this.escape(senderName)} through PlanoraHub` : 'Sent through PlanoraHub';
    return template
      .replaceAll('{{body}}', body)
      .replaceAll('{{sender}}', sender);
  }

  private workspaceShell(body: string, senderName?: string) {
    const sender = senderName ? `<span style="color:#8a808b;font-size:12px">Sent by ${this.escape(senderName)} through PlanoraHub</span>` : '';
    return `<!doctype html><html><body style="margin:0;background:#f4f1f5;font-family:Inter,Arial,sans-serif;color:#211d22"><div style="max-width:680px;margin:0 auto;padding:30px 16px"><div style="background:#ffffff;border:1px solid #e8dde9;border-radius:18px;overflow:hidden"><div style="height:5px;background:linear-gradient(90deg,#5b1769,#8b3f99,#c994d2)"></div><div style="padding:24px 28px 18px"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #eee7ef;padding-bottom:18px;margin-bottom:22px"><div style="font-size:20px;font-weight:850;color:#541961">PlanoraHub</div>${sender}</div><div style="font-size:15px;line-height:1.75;color:#352f37">${body}</div><div style="border-top:1px solid #eee7ef;margin-top:26px;padding-top:16px;color:#8a808b;font-size:11px;line-height:1.6">This message was sent through PlanoraHub CRM. Please reply to this email to continue the conversation.</div></div></div><p style="text-align:center;color:#958b97;font-size:11px;margin:14px 0 0">PlanoraHub · Business Operations</p></div></body></html>`;
  }

  private async send(input: {
    to: string | string[];
    cc?: string[];
    subject: string;
    html: string;
    idempotencyKey: string;
    fromName?: string;
    attachments?: WorkspaceAttachment[];
    headers?: Record<string, string>;
    replyTo?: string;
  }): Promise<MailDelivery> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const fromEmail = this.config.get<string>('RESEND_FROM_EMAIL')?.trim();
    const configuredFromName = this.config.get<string>('RESEND_FROM_NAME')?.trim() || 'PlanoraHub CRM';
    const fromName = input.fromName?.trim() || configuredFromName;

    if (!apiKey || !fromEmail) {
      return {
        status: 'SKIPPED',
        message: 'Resend is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL on the backend.',
      };
    }

    try {
      const payload: Record<string, unknown> = {
        from: `${fromName} <${fromEmail}>`,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
      };
      if (input.cc?.length) payload.cc = input.cc;
      if (input.replyTo) payload.reply_to = input.replyTo;
      if (input.attachments?.length) {
        payload.attachments = input.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
        }));
      }
      if (input.headers && Object.keys(input.headers).length) payload.headers = input.headers;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const responseBody = (await response.json().catch(() => ({}))) as { id?: string; message_id?: string; message?: string; error?: { message?: string } };
      if (!response.ok) {
        return {
          status: 'FAILED',
          message: responseBody?.message || responseBody?.error?.message || `Resend returned ${response.status}`,
        };
      }

      return {
        status: 'SENT',
        id: responseBody.id,
        messageId: responseBody.message_id,
        message: 'Email sent successfully.',
      };
    } catch (error) {
      return {
        status: 'FAILED',
        message: error instanceof Error ? error.message : 'Unable to reach Resend.',
      };
    }
  }

  private loginUrl() {
    const explicit = this.config.get<string>('CRM_LOGIN_URL')?.trim();
    if (explicit) return explicit;
    const frontend = this.config.get<string>('FRONTEND_URL')?.trim()?.replace(/\/$/, '');
    return frontend ? `${frontend}/login` : 'https://crm.planorahub.app/login';
  }

  private frontendUrl(path: string) {
    const frontend = this.config.get<string>('FRONTEND_URL')?.trim()?.replace(/\/$/, '') || 'https://crm.planorahub.app';
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `${frontend}${clean}`;
  }

  private escape(value: string) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
