'use client';

import Image from 'next/image';
import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
} from 'lucide-react';
import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase/client';
import styles from './login.module.css';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] =
    useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        window.location.replace('/dashboard');
        return;
      }

      setCheckingSession(false);
    }

    void checkSession();
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setError(null);

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (error || !data.session) {
      setError(
        error?.message ??
          'Unable to create a login session.',
      );
      setLoading(false);
      return;
    }

    window.location.assign('/dashboard');
  }

  if (checkingSession) {
    return (
      <main className={styles.loadingPage}>
        <Loader2
          size={18}
          className="animate-spin"
        />
        <span>Loading Planorahub CRM...</span>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Image
          src="/planorahub.png"
          alt="Planorahub CRM"
          width={600}
          height={300}
          priority
          className={styles.logo}
        />

        <div className={styles.card}>
          <span className={styles.badge}>
            Administrator Portal
          </span>

          <h1 className={styles.title}>
            Welcome back
          </h1>

          <p className={styles.subtitle}>
            Sign in with your Planorahub
            administrator credentials.
          </p>

          <form
            onSubmit={handleSubmit}
            className={styles.form}
          >
            <div>
              <label
                htmlFor="email"
                className={styles.label}
              >
                Email address
              </label>

              <div className={styles.inputWrapper}>
                <Mail
                  size={18}
                  className={styles.leftIcon}
                />

                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="admin@planorahub.com"
                  className={styles.input}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className={styles.label}
              >
                Password
              </label>

              <div className={styles.inputWrapper}>
                <LockKeyhole
                  size={18}
                  className={styles.leftIcon}
                />

                <input
                  id="password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  className={styles.input}
                />

                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() =>
                    setShowPassword(
                      (value) => !value,
                    )
                  }
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <div className={styles.error}>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className={styles.submit}
            >
              {loading
                ? 'Signing in...'
                : 'Sign in'}
            </button>
          </form>

          <p className={styles.notice}>
            Access is restricted to authorised
            Planorahub personnel.
          </p>
        </div>
      </div>
    </main>
  );
}