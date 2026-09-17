export type PermissionOverrideInput = {
  permissionId: string;
  effect: 'ALLOW' | 'DENY';
  reason?: string;
};

export class CreateStaffDto {
  firstName!: string;
  lastName!: string;
  email!: string;

  phone?: string;
  jobTitle?: string;

  roleId!: string;

  departmentId?: string;

  teamIds?: string[];

  permissionOverrides?: PermissionOverrideInput[];

  directMessageUserIds?: string[];
}
