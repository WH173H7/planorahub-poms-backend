import type { CrmUser } from '@/types/auth';

const ADMIN_PERMISSIONS = new Set([
  'analytics.read.all',
  'users.read.all',
  'users.create',
  'roles.manage',
  'departments.manage',
  'teams.manage',
  'leads.read.all',
  'tasks.read.all',
  'activities.read.all',
  'audit.read.all',
  'broadcasts.manage',
]);

// Protected operational roles always enter the employee workspace first.
// Their individual permissions still decide which extra workspaces appear.
const STAFF_ROLE_CODES = new Set([
  'MARKETING',
  'FINANCE',
  'GENERAL_STAFF',
  'SALES_EXECUTIVE',
  'CUSTOMER_SUCCESS',
]);

export function isSuperAdmin(user: CrmUser): boolean {
  return user.role_code === 'SUPER_ADMIN';
}

export function hasPermission(user: CrmUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

export function hasAllPermissions(user: CrmUser, permissions: string[]): boolean {
  return permissions.every((permission) => hasPermission(user, permission));
}

export function hasAnyPermission(user: CrmUser, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function isOperationalStaff(user: CrmUser): boolean {
  return STAFF_ROLE_CODES.has(user.role_code);
}

export function hasAdministrativeAccess(user: CrmUser): boolean {
  if (isSuperAdmin(user)) return true;
  // Effective permissions are authoritative, including explicit per-user
  // ALLOW/DENY overrides. A built-in staff role still lands on /home, but
  // an intentionally granted company-wide permission must remain usable.
  return user.permissions.some((permission) => ADMIN_PERMISSIONS.has(permission));
}

export function canUseCompanyTasks(user: CrmUser): boolean {
  return isSuperAdmin(user) || hasPermission(user, 'tasks.read.all');
}

export function canUseCompanyActivities(user: CrmUser): boolean {
  return isSuperAdmin(user) || hasPermission(user, 'activities.read.all');
}

export function routeForUser(user: CrmUser): string {
  if (isSuperAdmin(user)) return '/dashboard';

  if (isOperationalStaff(user)) return '/home';

  // Custom roles are routed only to a page their effective permission set
  // can actually load. This prevents partial admin roles from landing on a
  // workspace whose supporting APIs they cannot read.
  if (hasPermission(user, 'analytics.read.all')) return '/dashboard';
  if (hasAllPermissions(user, ['users.read.all', 'users.create'])) return '/staff';
  if (hasPermission(user, 'leads.read.all')) return '/leads';
  if (hasPermission(user, 'tasks.read.all')) return '/tasks';
  if (hasPermission(user, 'activities.read.all')) return '/activities';
  if (hasPermission(user, 'audit.read.all')) return '/audit-logs';
  if (hasPermission(user, 'invoices.read')) return '/invoices';
  return '/home';
}
