import type { CrmUser } from '@/types/auth';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'SALES_MANAGER']);

export function hasAdministrativeAccess(user: CrmUser): boolean {
  return ADMIN_ROLES.has(user.role_code);
}

export function routeForUser(user: CrmUser): '/dashboard' | '/home' {
  return hasAdministrativeAccess(user) ? '/dashboard' : '/home';
}
