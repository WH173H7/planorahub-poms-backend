import { supabase } from './supabase/client';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:4000/api';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(
      `Session error: ${sessionError.message}`,
    );
  }

  if (!session?.access_token) {
    throw new Error(
      'No authenticated session was found.',
    );
  }

  const cleanPath = path.startsWith('/')
    ? path
    : `/${path}`;

  const url = `${API_URL}${cleanPath}`;

  const isFormData =
    typeof FormData !== 'undefined' &&
    options.body instanceof FormData;

  const headers = new Headers(
    options.headers ?? {},
  );

  headers.set(
    'Authorization',
    `Bearer ${session.access_token}`,
  );

  // Let the browser set multipart/form-data and its boundary.
  // For normal request bodies, default to JSON.
  if (
    options.body &&
    !isFormData &&
    !headers.has('Content-Type')
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    );
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();

  let body: unknown;

  try {
    body = text
      ? JSON.parse(text)
      : null;
  } catch {
    throw new Error(
      `API returned non-JSON response: ${text}`,
    );
  }

  if (!response.ok) {
    const errorBody = body as {
      message?: string | string[];
    };

    const message = Array.isArray(
      errorBody?.message,
    )
      ? errorBody.message.join(', ')
      : errorBody?.message;

    throw new Error(
      message ??
        `API request failed with status ${response.status}`,
    );
  }

  return body as T;
}
