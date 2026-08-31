import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import {
  type ContactMethodInput,
  type ContactMethodType,
  type ContactMethodVerificationStatus,
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
    private readonly contacts: ContactsRepository,
    private readonly audit: AuditService,
  ) {}

  async listAll() {
    return this.contacts.listAll();
  }

  async listByOrganization(organizationId: string) {
    return this.contacts.listByOrganization(organizationId);
  }

  async get(id: string) {
    const contact = await this.contacts.findById(id);

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  async create(
    body: Partial<ContactInput>,
    context?: ActionContext,
  ) {
    const input = await this.validate(body);

    let contact;
    try {
      contact = await this.contacts.create(
        input,
        context?.actorUserId,
      );
    } catch (error) {
      this.rethrowConstraintError(error);
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'CONTACT_CREATED',
      module: 'contacts',
      entityType: 'contact',
      entityId: contact.id,
      newValues: {
        ...contact,
        organizationId: contact.organization_id,
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

    const input = await this.validate({
      organizationId:
        body.organizationId ?? current.organization_id,
      firstName:
        body.firstName ?? current.first_name,
      lastName:
        body.lastName ?? current.last_name,
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

    let updated;
    try {
      updated = await this.contacts.update(id, input);
    } catch (error) {
      this.rethrowConstraintError(error);
    }

    if (!updated) {
      throw new NotFoundException('Contact not found');
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

    const deleted = await this.contacts.delete(id);

    if (!deleted) {
      throw new NotFoundException('Contact not found');
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

  async listMethods(contactId: string) {
    await this.get(contactId);
    return this.contacts.listMethods(contactId);
  }

  async createMethod(
    contactId: string,
    body: Partial<ContactMethodInput>,
    context?: ActionContext,
  ) {
    await this.get(contactId);
    const input = this.validateMethod(body, true);

    if (input.isPrimary) {
      await this.contacts.clearPrimaryMethod(
        contactId,
        input.type,
      );
    }

    let method;
    try {
      method = await this.contacts.createMethod(
        contactId,
        input,
        context?.actorUserId,
      );
    } catch (error) {
      this.rethrowConstraintError(error);
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'CONTACT_METHOD_CREATED',
      module: 'contacts',
      entityType: 'contact_method',
      entityId: method.id,
      newValues: method,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return method;
  }

  async updateMethod(
    contactId: string,
    methodId: string,
    body: Partial<ContactMethodInput>,
    context?: ActionContext,
  ) {
    await this.get(contactId);

    const current = await this.contacts.findMethod(
      contactId,
      methodId,
    );

    if (!current) {
      throw new NotFoundException('Contact method not found');
    }

    const input = this.validateMethod(
      {
        type: body.type ?? current.type,
        value: body.value ?? current.value,
        label:
          body.label === undefined
            ? current.label
            : body.label,
        isPrimary:
          body.isPrimary ?? current.is_primary,
        verificationStatus:
          body.verificationStatus ??
          current.verification_status,
        notes:
          body.notes === undefined
            ? current.notes
            : body.notes,
      },
      false,
    );

    if (input.isPrimary) {
      await this.contacts.clearPrimaryMethod(
        contactId,
        input.type,
        methodId,
      );
    }

    let updated;
    try {
      updated = await this.contacts.updateMethod(
        contactId,
        methodId,
        input,
      );
    } catch (error) {
      this.rethrowConstraintError(error);
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'CONTACT_METHOD_UPDATED',
      module: 'contacts',
      entityType: 'contact_method',
      entityId: methodId,
      oldValues: current,
      newValues: updated,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return updated;
  }

  async deleteMethod(
    contactId: string,
    methodId: string,
    context?: ActionContext,
  ) {
    await this.get(contactId);

    const current = await this.contacts.findMethod(
      contactId,
      methodId,
    );

    if (!current) {
      throw new NotFoundException('Contact method not found');
    }

    // System-managed EMAIL/PHONE rows mirror contacts.email/phone.
    // They must be changed through the Contact update endpoint so the
    // legacy field and normalized method cannot drift apart.
    if (current.legacy_source) {
      throw new BadRequestException(
        'This primary email or phone is managed by the contact record. Update the contact instead.',
      );
    }

    await this.contacts.deleteMethod(contactId, methodId);

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'CONTACT_METHOD_DELETED',
      module: 'contacts',
      entityType: 'contact_method',
      entityId: methodId,
      oldValues: current,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      id: methodId,
      deleted: true,
    };
  }

  private async validate(
    body: Partial<ContactInput>,
  ): Promise<ContactInput> {
    const organizationId = body.organizationId?.trim();
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();

    if (!organizationId || !firstName || !lastName) {
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
      jobTitle: this.clean(body.jobTitle),
      email: this.clean(body.email),
      phone: this.clean(body.phone),
      isPrimary: body.isPrimary ?? false,
      notes: this.clean(body.notes),
    };
  }

  private clean(value: string | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }

    return value.trim() || null;
  }

  private validateMethod(
    body: Partial<ContactMethodInput>,
    creating: boolean,
  ): ContactMethodInput {
    const types: ContactMethodType[] = [
      'EMAIL',
      'PHONE',
      'LINKEDIN',
      'X',
      'INSTAGRAM',
      'FACEBOOK',
      'WEBSITE',
      'OTHER',
    ];
    const statuses: ContactMethodVerificationStatus[] = [
      'UNVERIFIED',
      'VERIFIED',
      'INVALID',
    ];

    const type = body.type as ContactMethodType;
    const value = body.value?.trim();

    if (!types.includes(type)) {
      throw new BadRequestException(
        'Invalid contact method type',
      );
    }

    if (!value) {
      throw new BadRequestException(
        'Contact method value is required',
      );
    }

    if (value.length > 500) {
      throw new BadRequestException(
        'Contact method value is too long',
      );
    }

    const verificationStatus = creating
      ? 'UNVERIFIED'
      : (body.verificationStatus ?? 'UNVERIFIED');

    if (!statuses.includes(verificationStatus)) {
      throw new BadRequestException(
        'Invalid verification status',
      );
    }

    return {
      type,
      value,
      label: this.clean(body.label),
      isPrimary: body.isPrimary ?? false,
      verificationStatus,
      notes: this.clean(body.notes),
    };
  }

  private rethrowConstraintError(error: unknown): never {
    if ((error as { code?: string }).code === '23505') {
      throw new BadRequestException(
        'This contact method already exists or conflicts with another primary method',
      );
    }

    throw error;
  }
}
