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

export function hasAdministrativeAccess(user: CrmUser): boolean {
  if (user.role_code === 'SUPER_ADMIN') return true;
  return user.permissions.some((permission) => ADMIN_PERMISSIONS.has(permission));
}

export function routeForUser(user: CrmUser): string {
  if (user.role_code === 'SUPER_ADMIN' || user.permissions.includes('analytics.read.all')) return '/dashboard';
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
