import { apiFetch } from '@/lib/api/client';
import type { AuthMeResponse, CrmUser } from '@/types/auth';

export async function getCurrentCrmUser(): Promise<CrmUser> {
  const response = await apiFetch<AuthMeResponse>('/auth/me', {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  return response.data;
}
