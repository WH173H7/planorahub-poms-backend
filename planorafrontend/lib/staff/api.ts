import { apiFetch } from '@/lib/api/client';

type R<T> = { success: boolean; data: T };

export type Permission = {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system_role?: boolean;
  is_active?: boolean;
  staff_count?: number;
  department_ids?: string[];
  permissions?: Permission[];
};

export type Staff = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  must_change_password?: boolean;
  role_id: string;
  role_name: string;
  role_code: string;
  department_id: string | null;
  department_name: string | null;
  team_names?: string;
  created_at: string;
};

export type Department = { id: string; name: string; description: string | null };
export type MailDelivery = { status: 'SENT' | 'FAILED' | 'SKIPPED'; id?: string; message: string };

export async function listStaff() {
  return (await apiFetch<R<Staff[]>>('/admin/staff')).data;
}

export async function getStaff(id: string) {
  return (await apiFetch<R<Record<string, unknown>>>(`/admin/staff/${id}`)).data;
}

export async function createStaff(input: Record<string, unknown>) {
  return (await apiFetch<R<{ staff: Staff; temporaryPassword: string; emailDelivery: MailDelivery }>>('/admin/staff', {
    method: 'POST',
    body: JSON.stringify(input),
  })).data;
}

export async function setStaffStatus(id: string, action: 'suspend' | 'disable' | 'reactivate') {
  return (await apiFetch<R<Staff>>(`/admin/staff/${id}/${action}`, { method: 'POST' })).data;
}

export async function listRoles() {
  return (await apiFetch<R<Role[]>>('/admin/roles')).data;
}

export async function createRole(input: { name: string; description?: string; permissionIds: string[] }) {
  return (await apiFetch<R<Role>>('/admin/roles', {
    method: 'POST',
    body: JSON.stringify(input),
  })).data;
}

export async function updateRole(id: string, input: { name?: string; description?: string; permissionIds?: string[]; isActive?: boolean }) {
  return (await apiFetch<R<Role>>(`/admin/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })).data;
}

export async function listDepartments() {
  return (await apiFetch<R<Department[]>>('/admin/departments')).data;
}

export async function resetStaffPassword(id: string, input: { sendEmail: boolean }) {
  return (await apiFetch<R<{ temporaryPassword: string; emailDelivery: MailDelivery }>>(`/admin/staff/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(input),
  })).data;
}

export async function updateStaff(id: string, input: Record<string, unknown>) {
  return (await apiFetch<R<Record<string, unknown>>>(`/admin/staff/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })).data;
}

export async function listTeams() {
  return (await apiFetch<R<Array<{ id: string; name: string; department_id: string; department_name?: string }>>>('/admin/teams-manage')).data;
}

export async function listPermissions() {
  return (await apiFetch<R<Permission[]>>('/admin/permissions')).data;
}
