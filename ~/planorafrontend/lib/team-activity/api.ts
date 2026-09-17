import { apiFetch } from '@/lib/api/client';

export type TeamActivityItem = {
  id: string;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string | null;
  new_values: Record<string, unknown> | null;
  old_values: Record<string, unknown> | null;
  created_at: string;
  actor_user_id: string | null;
  actor_first_name: string | null;
  actor_last_name: string | null;
  actor_email: string | null;
  reviewed: boolean;
  reviewed_at: string | null;
  review_note: string | null;
  lead_id: string | null;
  lead_title: string | null;
  organization_id: string | null;
  organization_name: string | null;
  task_id: string | null;
  task_title: string | null;
  activity_id: string | null;
  activity_title: string | null;
};

export type TeamActivityStaff = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type TeamActivityLeadOption = {
  id: string;
  title: string;
  organization_name: string | null;
};

export type TeamActivityOrganizationOption = {
  id: string;
  name: string;
};

export type TeamActivityData = {
  items: TeamActivityItem[];
  staff: TeamActivityStaff[];
  types: string[];
  leads: TeamActivityLeadOption[];
  organizations: TeamActivityOrganizationOption[];
};

export async function listTeamActivity(filters: {
  search?: string;
  staffId?: string;
  type?: string;
  leadId?: string;
  organizationId?: string;
  from?: string;
  to?: string;
  reviewed?: string;
} = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const response = await apiFetch<{ success: true; data: TeamActivityData }>(
    `/admin/team-activity${params.size ? `?${params}` : ''}`,
  );
  return response.data;
}

export async function getTeamActivity(id: string) {
  const response = await apiFetch<{ success: true; data: TeamActivityItem }>(
    `/admin/team-activity/${id}`,
  );
  return response.data;
}

export async function updateTeamActivityReview(
  id: string,
  input: { reviewed?: boolean; response?: string | null },
) {
  const response = await apiFetch<{
    success: true;
    data: {
      activityId: string;
      reviewed: boolean;
      reviewedAt: string | null;
      response: string | null;
      updatedAt: string;
    };
  }>(`/admin/team-activity/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function setTeamActivityReviewed(id: string, reviewed: boolean) {
  return updateTeamActivityReview(id, { reviewed });
}
