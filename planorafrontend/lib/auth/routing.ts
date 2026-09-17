import type { CrmUser } from '@/types/auth';

const ADMIN_PERMISSIONS = new Set([
  'analytics.read.all',
  'users.read.all',
  'users.create',
  'roles.manage',
  'departments.manage',
  'leads.read.all',
  'tasks.read.all',
  'audit.read.all',
]);

// These are operational staff roles even if an administrator accidentally
// grants them a broad permission. They should enter the staff workspace first.
const STAFF_ROLE_CODES = new Set([
  'MARKETING',
  'FINANCE',
  'GENERAL_STAFF',
  'SALES_EXECUTIVE',
  'CUSTOMER_SUCCESS',
]);

export function isOperationalStaff(user: CrmUser): boolean {
  return STAFF_ROLE_CODES.has(user.role_code);
}

export function hasAdministrativeAccess(user: CrmUser): boolean {
  if (user.role_code === 'SUPER_ADMIN') return true;
  if (isOperationalStaff(user)) return false;
  return user.permissions.some((permission) => ADMIN_PERMISSIONS.has(permission));
}

export function routeForUser(user: CrmUser): string {
  if (user.role_code === 'SUPER_ADMIN') return '/dashboard';

  // Built-in operational roles always land in My Day. Their sidebar then
  // exposes only the workspaces their effective permissions allow.
  if (isOperationalStaff(user)) return '/home';

  if (user.permissions.includes('analytics.read.all')) return '/dashboard';
  if (
    user.permissions.includes('users.read.all') ||
    user.permissions.includes('users.create') ||
    user.permissions.includes('roles.manage') ||
    user.permissions.includes('departments.manage')
  ) return '/staff';
  if (user.permissions.includes('leads.read.all')) return '/leads';
  if (user.permissions.includes('tasks.read.all')) return '/tasks';
  return '/home';
}
