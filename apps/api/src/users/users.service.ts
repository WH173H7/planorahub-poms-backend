import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { SupabaseService } from '../supabase/supabase.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  async listStaff() {
    return this.usersRepository.listStaff();
  }

  async getStaff(id: string) {
    const staff = await this.usersRepository.findById(id);

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    return staff;
  }

  async createStaff(
    dto: CreateStaffDto,
    context?: {
      actorUserId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.usersRepository.findByEmail(email);

    if (existing) {
      throw new ConflictException(
        'A staff account with this email already exists',
      );
    }

    const roleExists = await this.usersRepository.roleExists(dto.roleId);

    if (!roleExists) {
      throw new BadRequestException('Invalid role');
    }

    if (dto.departmentId) {
      const departmentExists =
        await this.usersRepository.departmentExists(dto.departmentId);

      if (!departmentExists) {
        throw new BadRequestException('Invalid department');
      }
    }

    const teamIds = [...new Set(dto.teamIds ?? [])];

    if (!(await this.usersRepository.teamsExist(teamIds))) {
      throw new BadRequestException('One or more teams are invalid');
    }

    const permissionOverrides = dto.permissionOverrides ?? [];

    const permissionIds = [
      ...new Set(
        permissionOverrides.map((override) => override.permissionId),
      ),
    ];

    if (!(await this.usersRepository.permissionsExist(permissionIds))) {
      throw new BadRequestException(
        'One or more permission overrides are invalid',
      );
    }

    const temporaryPassword = this.generateTemporaryPassword();

    const { data, error } =
      await this.supabase.admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,

        user_metadata: {
          first_name: dto.firstName.trim(),
          last_name: dto.lastName.trim(),
          must_change_password: true,
        },
      });

    if (error || !data.user) {
      throw new BadRequestException(
        error?.message ?? 'Unable to create authentication account',
      );
    }

    let staff:
      | Awaited<ReturnType<UsersRepository['createStaff']>>
      | undefined;

    try {
      staff = await this.usersRepository.createStaff({
        authUserId: data.user.id,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email,
        phone: dto.phone?.trim(),
        jobTitle: dto.jobTitle?.trim(),
        roleId: dto.roleId,
        departmentId: dto.departmentId,
        createdById: context?.actorUserId,
      });

      await this.usersRepository.addTeamMemberships(
        staff.id,
        teamIds,
      );

      await this.usersRepository.addPermissionOverrides(
        staff.id,
        permissionOverrides,
        context?.actorUserId,
      );

      await this.audit.log({
        actorUserId: context?.actorUserId,
        action: 'STAFF_CREATED',
        module: 'users',
        entityType: 'user',
        entityId: staff.id,

        newValues: {
          firstName: staff.first_name,
          lastName: staff.last_name,
          email: staff.email,
          roleId: staff.role_id,
          departmentId: staff.department_id,
          teamIds,
          permissionOverrides,
        },

        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });

      return {
        staff,
        temporaryPassword,
      };
    } catch (error) {
      await this.supabase.admin.auth.admin.deleteUser(data.user.id);

      if (staff?.id) {
        await this.usersRepository
          .deleteInternalUser(staff.id)
          .catch(() => undefined);
      }

      throw new InternalServerErrorException(
        'Staff creation could not be completed',
      );
    }
  }

  private generateTemporaryPassword() {
    return `POMS-${randomBytes(9).toString('base64url')}!`;
  }
}
