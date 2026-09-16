import { createClient } from '@supabase/supabase-js';

const REMEMBER_ME_KEY = 'planorahub.auth.remember-me';
const REMEMBERED_EMAIL_KEY = 'planorahub.auth.remembered-email';

function canUseBrowserStorage() {
  return typeof window !== 'undefined';
}

function readStorage(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Supabase will continue in the current page even if browser storage is blocked.
  }
}

function removeStorage(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore browser storage cleanup failures.
  }
}

function rememberMeEnabled() {
  if (!canUseBrowserStorage()) return false;
  return readStorage(window.localStorage, REMEMBER_ME_KEY) === 'true';
}

/**
 * Supabase normally stores sessions in localStorage, which effectively makes
 * every login a remembered login. This adapter keeps ordinary sessions in
 * sessionStorage and only uses localStorage when the user explicitly selects
 * "Remember me" on the login screen.
 */
const planoraAuthStorage = {
  getItem(key: string) {
    if (!canUseBrowserStorage()) return null;

    const primary = rememberMeEnabled()
      ? window.localStorage
      : window.sessionStorage;

    return readStorage(primary, key);
  },

  setItem(key: string, value: string) {
    if (!canUseBrowserStorage()) return;

    const persistent = rememberMeEnabled();
    const primary = persistent ? window.localStorage : window.sessionStorage;
    const secondary = persistent ? window.sessionStorage : window.localStorage;

    writeStorage(primary, key, value);
    // Never leave a second copy of an auth token in the other storage scope.
    removeStorage(secondary, key);
  },

  removeItem(key: string) {
    if (!canUseBrowserStorage()) return;
    // Sign-out should clear both possible session locations.
    removeStorage(window.localStorage, key);
    removeStorage(window.sessionStorage, key);
  },
};

export function setRememberMePreference(remember: boolean) {
  if (!canUseBrowserStorage()) return;

  if (remember) {
    writeStorage(window.localStorage, REMEMBER_ME_KEY, 'true');
    return;
  }

  removeStorage(window.localStorage, REMEMBER_ME_KEY);
  removeStorage(window.localStorage, REMEMBERED_EMAIL_KEY);
}

export function setRememberedEmail(email: string) {
  if (!canUseBrowserStorage() || !rememberMeEnabled()) return;
  const normalized = email.trim().toLowerCase();
  if (normalized) {
    writeStorage(window.localStorage, REMEMBERED_EMAIL_KEY, normalized);
  }
}

export function getRememberMePreference() {
  return rememberMeEnabled();
}

export function getRememberedEmail() {
  if (!canUseBrowserStorage() || !rememberMeEnabled()) return '';
  return readStorage(window.localStorage, REMEMBERED_EMAIL_KEY) ?? '';
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: planoraAuthStorage,
    },
  },
);
