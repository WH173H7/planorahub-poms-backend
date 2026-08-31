import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import {
  type OrganizationInput,
  type OrganizationStatus,
  OrganizationsRepository,
} from './organizations.repository.js';

type ActionContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly organizations:
      OrganizationsRepository,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.organizations.list();
  }

  async get(id: string) {
    const organization =
      await this.organizations.findById(id);

    if (!organization) {
      throw new NotFoundException(
        'Organization not found',
      );
    }

    return organization;
  }

  async create(
    body: Partial<OrganizationInput>,
    context?: ActionContext,
  ) {
    const input =
      await this.validateInput(body);

    const duplicate =
      await this.organizations.findDuplicateName(
        input.name,
      );

    if (duplicate) {
      throw new ConflictException(
        'An organization with this name already exists',
      );
    }

    const organization =
      await this.organizations.create(
        input,
        context?.actorUserId,
      );

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'ORGANIZATION_CREATED',
      module: 'organizations',
      entityType: 'organization',
      entityId: organization.id,
      newValues: organization,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(organization.id);
  }

  async update(
    id: string,
    body: Partial<OrganizationInput>,
    context?: ActionContext,
  ) {
    const current = await this.get(id);

    const input = await this.validateInput({
      name: body.name ?? current.name,
      legalName:
        body.legalName === undefined
          ? current.legal_name
          : body.legalName,
      organizationType:
        body.organizationType ??
        current.organization_type,
      industry:
        body.industry === undefined
          ? current.industry
          : body.industry,
      email:
        body.email === undefined
          ? current.email
          : body.email,
      phone:
        body.phone === undefined
          ? current.phone
          : body.phone,
      website:
        body.website === undefined
          ? current.website
          : body.website,
      addressLine1:
        body.addressLine1 === undefined
          ? current.address_line1
          : body.addressLine1,
      addressLine2:
        body.addressLine2 === undefined
          ? current.address_line2
          : body.addressLine2,
      city:
        body.city === undefined
          ? current.city
          : body.city,
      state:
        body.state === undefined
          ? current.state
          : body.state,
      country:
        body.country === undefined
          ? current.country
          : body.country,
      notes:
        body.notes === undefined
          ? current.notes
          : body.notes,
      assignedOwnerId:
        body.assignedOwnerId === undefined
          ? current.assigned_owner_id
          : body.assignedOwnerId,
    });

    const duplicate =
      await this.organizations.findDuplicateName(
        input.name,
        id,
      );

    if (duplicate) {
      throw new ConflictException(
        'An organization with this name already exists',
      );
    }

    const updated =
      await this.organizations.update(
        id,
        input,
      );

    if (!updated) {
      throw new NotFoundException(
        'Organization not found',
      );
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'ORGANIZATION_UPDATED',
      module: 'organizations',
      entityType: 'organization',
      entityId: id,
      oldValues: current,
      newValues: updated,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(id);
  }

  async setStatus(
    id: string,
    status: OrganizationStatus,
    context?: ActionContext,
  ) {
    if (
      ![
        'ACTIVE',
        'INACTIVE',
        'ARCHIVED',
      ].includes(status)
    ) {
      throw new BadRequestException(
        'Invalid organization status',
      );
    }

    const current = await this.get(id);

    const updated =
      await this.organizations.setStatus(
        id,
        status,
      );

    if (!updated) {
      throw new NotFoundException(
        'Organization not found',
      );
    }

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action:
        status === 'ARCHIVED'
          ? 'ORGANIZATION_ARCHIVED'
          : status === 'ACTIVE'
            ? 'ORGANIZATION_ACTIVATED'
            : 'ORGANIZATION_DEACTIVATED',
      module: 'organizations',
      entityType: 'organization',
      entityId: id,
      oldValues: {
        status: current.status,
      },
      newValues: {
        status,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return this.get(id);
  }

  private async validateInput(
    body: Partial<OrganizationInput>,
  ): Promise<OrganizationInput> {
    const name = body.name?.trim();

    if (!name) {
      throw new BadRequestException(
        'Organization name is required',
      );
    }

    const organizationType =
      body.organizationType ?? 'PROSPECT';

    if (
      ![
        'PROSPECT',
        'CUSTOMER',
        'PARTNER',
        'OTHER',
      ].includes(organizationType)
    ) {
      throw new BadRequestException(
        'Invalid organization type',
      );
    }

    const assignedOwnerId =
      this.clean(body.assignedOwnerId);

    if (
      assignedOwnerId &&
      !(await this.organizations.userExists(
        assignedOwnerId,
      ))
    ) {
      throw new BadRequestException(
        'Assigned account owner is invalid',
      );
    }

    return {
      name,
      legalName: this.clean(body.legalName),
      organizationType,
      industry: this.clean(body.industry),
      email: this.clean(body.email),
      phone: this.clean(body.phone),
      website: this.clean(body.website),
      addressLine1: this.clean(
        body.addressLine1,
      ),
      addressLine2: this.clean(
        body.addressLine2,
      ),
      city: this.clean(body.city),
      state: this.clean(body.state),
      country: this.clean(body.country),
      notes: this.clean(body.notes),
      assignedOwnerId,
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
