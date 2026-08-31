import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import {
  ActivitiesRepository,
  type ActivityInput,
  type ActivityStatus,
  type ActivityType,
} from './activities.repository.js';

type ActionContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly activities: ActivitiesRepository,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.activities.list();
  }

  async listForLead(leadId: string) {
    if (!(await this.activities.entityExists('leads', leadId))) {
      throw new NotFoundException('Lead not found');
    }
    return this.activities.listForLead(leadId);
  }

  async get(id: string) {
    const activity = await this.activities.findById(id);
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async create(body: Partial<ActivityInput>, context?: ActionContext) {
    const input = await this.validate(body);
    const activity = await this.activities.create(input, context?.actorUserId);

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'ACTIVITY_CREATED',
      module: 'activities',
      entityType: 'activity',
      entityId: activity.id,
      newValues: activity,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return activity;
  }

  async update(
    id: string,
    body: Partial<ActivityInput>,
    context?: ActionContext,
  ) {
    const current = await this.get(id);

    const input = await this.validate({
      title: body.title ?? current.title,
      activityType: body.activityType ?? current.activity_type,
      status: body.status ?? current.status,
      description:
        body.description === undefined ? current.description : body.description,
      outcome: body.outcome === undefined ? current.outcome : body.outcome,
      organizationId:
        body.organizationId === undefined
          ? current.organization_id
          : body.organizationId,
      contactId:
        body.contactId === undefined ? current.contact_id : body.contactId,
      leadId:
        body.leadId === undefined ? current.lead_id : body.leadId,
      assignedToId:
        body.assignedToId === undefined
          ? current.assigned_to_id
          : body.assignedToId,
      scheduledAt:
        body.scheduledAt === undefined
          ? current.scheduled_at
          : body.scheduledAt,
      nextFollowUpAt:
        body.nextFollowUpAt === undefined
          ? current.next_follow_up_at
          : body.nextFollowUpAt,
    });

    const updated = await this.activities.update(id, input);
    if (!updated) throw new NotFoundException('Activity not found');

    const action =
      current.status !== 'COMPLETED' && updated.status === 'COMPLETED'
        ? 'ACTIVITY_COMPLETED'
        : 'ACTIVITY_UPDATED';

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action,
      module: 'activities',
      entityType: 'activity',
      entityId: id,
      oldValues: current,
      newValues: updated,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return updated;
  }

  async remove(id: string, context?: ActionContext) {
    const current = await this.get(id);
    await this.activities.remove(id);

    await this.audit.log({
      actorUserId: context?.actorUserId,
      action: 'ACTIVITY_DELETED',
      module: 'activities',
      entityType: 'activity',
      entityId: id,
      oldValues: current,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return { id, deleted: true };
  }

  private async validate(body: Partial<ActivityInput>): Promise<ActivityInput> {
    const title = body.title?.trim();
    if (!title) throw new BadRequestException('Activity title is required');

    const activityType = (body.activityType ?? 'FOLLOW_UP') as ActivityType;
    const status = (body.status ?? 'PLANNED') as ActivityStatus;

    const types: ActivityType[] = [
      'CALL',
      'MEETING',
      'EMAIL',
      'FOLLOW_UP',
      'NOTE',
      'OTHER',
    ];
    const statuses: ActivityStatus[] = [
      'PLANNED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ];

    if (!types.includes(activityType)) {
      throw new BadRequestException('Invalid activity type');
    }
    if (!statuses.includes(status)) {
      throw new BadRequestException('Invalid activity status');
    }

    const organizationId = this.clean(body.organizationId);
    const contactId = this.clean(body.contactId);
    const leadId = this.clean(body.leadId);
    const assignedToId = this.clean(body.assignedToId);

    if (
      organizationId &&
      !(await this.activities.entityExists('organizations', organizationId))
    ) {
      throw new BadRequestException('Invalid organization');
    }

    if (
      contactId &&
      !(await this.activities.entityExists('contacts', contactId))
    ) {
      throw new BadRequestException('Invalid contact');
    }

    if (leadId && !(await this.activities.entityExists('leads', leadId))) {
      throw new BadRequestException('Invalid lead');
    }

    if (
      assignedToId &&
      !(await this.activities.entityExists('users', assignedToId))
    ) {
      throw new BadRequestException('Invalid assignee');
    }

    if (
      organizationId &&
      contactId &&
      !(await this.activities.contactBelongsToOrganization(
        contactId,
        organizationId,
      ))
    ) {
      throw new BadRequestException(
        'Contact must belong to the selected organization',
      );
    }

    if (
      organizationId &&
      leadId &&
      !(await this.activities.leadBelongsToOrganization(leadId, organizationId))
    ) {
      throw new BadRequestException(
        'Lead must belong to the selected organization',
      );
    }

    return {
      title,
      activityType,
      status,
      description: this.clean(body.description),
      outcome: this.clean(body.outcome),
      organizationId,
      contactId,
      leadId,
      assignedToId,
      scheduledAt: this.clean(body.scheduledAt),
      nextFollowUpAt: this.clean(body.nextFollowUpAt),
    };
  }

  private clean(value: string | null | undefined) {
    if (value === null || value === undefined) return null;
    return value.trim() || null;
  }
}
