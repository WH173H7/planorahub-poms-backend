import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import {
  type ContactInput,
  ContactsRepository,
} from './contacts.repository.js';

type ActionContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class ContactsService {
  constructor(
    private readonly contacts:
      ContactsRepository,
    private readonly audit: AuditService,
  ) {}

  async listAll() {
    return this.contacts.listAll();
  }

  async listByOrganization(
    organizationId: string,
  ) {
    return this.contacts.listByOrganization(
      organizationId,
    );
  }

  async get(id: string) {
    const contact =
      await this.contacts.findById(id);

    if (!contact) {
      throw new NotFoundException(
        'Contact not found',
      );
    }

    return contact;
  }

  async create(
    body: Partial<ContactInput>,
    context?: ActionContext,
  ) {
    const input =
      await this.validate(body);

    if (input.isPrimary) {
      await this.contacts.clearPrimary(
        input.organizationId,
      );
    }

    const contact =
      await this.contacts.create(
        input,
        context?.actorUserId,
      );

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'CONTACT_CREATED',
      module: 'contacts',
      entityType: 'contact',
      entityId: contact.id,
      newValues: {
        ...contact,
        organizationId:
          contact.organization_id,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(contact.id);
  }

  async update(
    id: string,
    body: Partial<ContactInput>,
    context?: ActionContext,
  ) {
    const current = await this.get(id);

    const input =
      await this.validate({
        organizationId:
          body.organizationId ??
          current.organization_id,
        firstName:
          body.firstName ??
          current.first_name,
        lastName:
          body.lastName ??
          current.last_name,
        jobTitle:
          body.jobTitle === undefined
            ? current.job_title
            : body.jobTitle,
        email:
          body.email === undefined
            ? current.email
            : body.email,
        phone:
          body.phone === undefined
            ? current.phone
            : body.phone,
        isPrimary:
          body.isPrimary === undefined
            ? current.is_primary
            : body.isPrimary,
        notes:
          body.notes === undefined
            ? current.notes
            : body.notes,
      });

    if (input.isPrimary) {
      await this.contacts.clearPrimary(
        input.organizationId,
        id,
      );
    }

    const updated =
      await this.contacts.update(
        id,
        input,
      );

    if (!updated) {
      throw new NotFoundException(
        'Contact not found',
      );
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'CONTACT_UPDATED',
      module: 'contacts',
      entityType: 'contact',
      entityId: id,
      oldValues: current,
      newValues: updated,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(id);
  }

  async delete(
    id: string,
    context?: ActionContext,
  ) {
    const current = await this.get(id);

    const deleted =
      await this.contacts.delete(id);

    if (!deleted) {
      throw new NotFoundException(
        'Contact not found',
      );
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'CONTACT_DELETED',
      module: 'contacts',
      entityType: 'contact',
      entityId: id,
      oldValues: current,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      id,
      deleted: true,
    };
  }

  private async validate(
    body: Partial<ContactInput>,
  ): Promise<ContactInput> {
    const organizationId =
      body.organizationId?.trim();
    const firstName =
      body.firstName?.trim();
    const lastName =
      body.lastName?.trim();

    if (
      !organizationId ||
      !firstName ||
      !lastName
    ) {
      throw new BadRequestException(
        'Organization, first name and last name are required',
      );
    }

    if (
      !(await this.contacts.organizationExists(
        organizationId,
      ))
    ) {
      throw new BadRequestException(
        'Invalid organization',
      );
    }

    return {
      organizationId,
      firstName,
      lastName,
      jobTitle: this.clean(
        body.jobTitle,
      ),
      email: this.clean(body.email),
      phone: this.clean(body.phone),
      isPrimary:
        body.isPrimary ?? false,
      notes: this.clean(body.notes),
    };
  }

  private clean(
    value: string | null | undefined,
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    return value.trim() || null;
  }
}
