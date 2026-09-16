'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api/client';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import { routeForUser } from '@/lib/auth/routing';
import { supabase } from '@/lib/supabase/client';

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace('/login');
        return;
      }
      try {
        const user = await getCurrentCrmUser();
        if (!active) return;
        if (!user.must_change_password) {
          window.location.replace(routeForUser(user));
          return;
        }
        setReady(true);
      } catch {
        if (active) window.location.replace('/login');
      }
    }
    void check();
    return () => { active = false; };
  }, []);

  const valid = password.length >= 10 && password === confirm;

  return (
    <main className="login-page first-login-page">
      <section className="login-form-side">
        <div className="login-card first-login-card">
          <div className="login-branding">
            <Image src="/planorahub.png" alt="PlanoraHub" width={180} height={90} priority className="login-logo" />
            <div className="login-heading">
              <span className="eyebrow">First login security</span>
              <h1>Create your password</h1>
              <p>Your temporary password worked. Choose a private password before entering PlanoraHub CRM.</p>
            </div>
          </div>

          <div className="first-login-notice">
            <strong>Required before access</strong>
            <span>This step protects your account and cannot be skipped.</span>
          </div>

          <form
            className="login-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!valid) return;
              setSaving(true);
              setError(null);
              const result = await supabase.auth.updateUser({ password });
              if (result.error) {
                setError(result.error.message);
                setSaving(false);
                return;
              }
              try {
                await apiFetch('/auth/password-changed', { method: 'POST' });
                const user = await getCurrentCrmUser();
                window.location.replace(routeForUser(user));
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Password changed, but the CRM account could not be activated.');
                setSaving(false);
              }
            }}
          >
            <div className="password-field-wrap">
              <Input
                label="New password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!ready || saving}
                required
              />
              <button type="button" className="password-visibility" onClick={() => setShow((value) => !value)}>{show ? 'Hide' : 'Show'}</button>
            </div>
            <Input
              label="Confirm new password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              disabled={!ready || saving}
              required
            />
            <div className="password-rules">
              <span className={password.length >= 10 ? 'is-met' : ''}>At least 10 characters</span>
              <span className={password && password === confirm ? 'is-met' : ''}>Passwords match</span>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button type="submit" size="lg" loading={saving} disabled={!ready || !valid || saving}>Save password & continue</Button>
          </form>
        </div>
      </section>
    </main>
  );
}
