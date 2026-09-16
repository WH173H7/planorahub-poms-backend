'use client';

import Image from 'next/image';
import { type FormEvent, useEffect, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import { routeForUser } from '@/lib/auth/routing';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkExistingSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (!data.session) {
        setCheckingSession(false);
        return;
      }

      try {
        const user = await getCurrentCrmUser();
        if (active) window.location.replace(user.must_change_password ? '/change-password' : routeForUser(user));
      } catch {
        if (active) setCheckingSession(false);
      }
    }

    void checkExistingSession();
    return () => {
      active = false;
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError || !data.session) {
      setError(
        authError?.message === 'Invalid login credentials'
          ? 'Invalid email or password. For a newly created staff account, use the temporary password shown by the Super Admin or ask the Super Admin to reset it.'
          : authError?.message ?? 'Unable to sign in. Please try again.',
      );
      setSubmitting(false);
      return;
    }

    try {
      const user = await getCurrentCrmUser();
      window.location.assign(user.must_change_password ? '/change-password' : routeForUser(user));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load your PlanoraHub CRM account.',
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-form-side">
        <div className="login-card">
          <div className="login-branding">
            <Image
              src="/planorahub.png"
              alt="PlanoraHub"
              width={180}
              height={90}
              priority
              className="login-logo"
            />
            <div className="login-heading">
              <h1>Welcome back</h1>
              <p>Sign in to continue to PlanoraHub CRM.</p>
            </div>
          </div>

          <form className="login-form" onSubmit={signIn}>
            <Input
              id="email"
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              disabled={submitting}
            />

            <div className="password-field-wrap">
              <Input
                id="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                className="password-visibility"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <Button
              type="submit"
              size="lg"
              loading={submitting}
              disabled={checkingSession || submitting}
            >
              {submitting
                ? 'Signing in...'
                : checkingSession
                  ? 'Checking account...'
                  : 'Sign in'}
            </Button>
          </form>

          <p className="login-security-note">
            PlanoraHub CRM · Authorised personnel only
          </p>
        </div>
      </section>
    </main>
  );
}
