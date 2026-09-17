import { supabase } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('Unable to verify your session. Please try again.');
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');

  const headers = new Headers(options.headers ?? {});
  headers.set('Authorization', `Bearer ${session.access_token}`);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, { ...options, headers });
  } catch {
    throw new Error('Network error. Please try again.');
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (response.status >= 500) throw new Error('Something went wrong. Please try again.');
      throw new Error('Unable to process the server response. Please try again.');
    }
  }

  if (!response.ok) {
    const errorBody = body as { message?: string | string[]; code?: string } | null;
    if (response.status === 403 && errorBody?.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') {
      window.location.replace('/change-password');
    }
    if (response.status >= 500) throw new Error('Something went wrong. Please try again.');

    const message = Array.isArray(errorBody?.message) ? errorBody.message.join(', ') : errorBody?.message;
    throw new Error(message ?? 'Unable to complete that request. Please try again.');
  }

  return body as T;
}
