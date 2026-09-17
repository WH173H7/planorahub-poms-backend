'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  usePathname,
  useRouter,
} from 'next/navigation';

import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

import {
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';

type MeResponse = {
  success: boolean;
  data: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    job_title: string | null;
    role_id: string;
    role_code: string;
    role_name: string;
    department_id: string | null;
    department_name: string | null;
    status: string;
    permissions: string[];
  };
};

type NavigationItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
  }>;
  permission?: string;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: 'Workspace',
    items: [
      {
        label: 'Overview',
        href: '/dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Work',
    items: [
      {
        label: 'Tasks',
        href: '/tasks',
        icon: ClipboardCheck,
      },
      {
        label: 'Activities',
        href: '/activities',
        icon: Activity,
      },
    ],
  },
  {
    label: 'CRM',
    items: [
      {
        label: 'Organizations',
        href: '/organizations',
        icon: Building2,
        permission: 'organizations.read.all',
      },
      {
        label: 'Contacts',
        href: '/contacts',
        icon: ContactRound,
      },
      {
        label: 'Leads',
        href: '/leads',
        icon: BriefcaseBusiness,
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        label: 'Analytics',
        href: '/analytics',
        icon: BarChart3,
      },
      {
        label: 'Audit Logs',
        href: '/audit',
        icon: ShieldCheck,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Staff',
        href: '/staff',
        icon: Users,
        permission: 'users.read.all',
      },
      {
        label: 'Settings',
        href: '/settings',
        icon: Settings,
      },
    ],
  },
];

export function AdminShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [profile, setProfile] =
    useState<MeResponse['data'] | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  useEffect(() => {
    async function initialise() {
      try {
        const {
          data: { session },
        } =
          await supabase.auth.getSession();

        if (!session) {
          router.replace('/login');
          return;
        }

        const response =
          await apiFetch<MeResponse>(
            '/auth/me',
          );

        setProfile(response.data);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load your Planorahub profile.',
        );
      } finally {
        setLoading(false);
      }
    }

    void initialise();
  }, [router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace('/login');
  }

  const visibleNavigation = useMemo(() => {
    if (!profile) return navigationGroups;

    const permissions =
      new Set(profile.permissions ?? []);

    if (
      profile.role_code === 'SUPER_ADMIN'
    ) {
      return navigationGroups;
    }

    return navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            !item.permission ||
            permissions.has(
              item.permission,
            ),
        ),
      }))
      .filter(
        (group) => group.items.length > 0,
      );
  }, [profile]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbfafb]">
        <div className="text-sm text-[#726874]">
          Loading Planorahub CRM...
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfafb] p-6">
        <div className="w-full max-w-lg rounded-2xl border border-[#e7dde9] bg-white p-8">
          <h1 className="text-xl font-semibold text-[#231d24]">
            Unable to load Admin Portal
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#726874]">
            {error ??
              'Your Planorahub profile could not be loaded.'}
          </p>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() =>
                window.location.reload()
              }
              className="rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Retry
            </button>

            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-[#e7dde9] px-4 py-2.5 text-sm font-semibold text-[#4c424d]"
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    );
  }

  const initials =
    `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`;

  return (
    <div className="min-h-screen bg-[#fbfafb] text-[#231d24]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] border-r border-[#ebe4ec] bg-white lg:block">
        <SidebarContent
          pathname={pathname}
          groups={visibleNavigation}
          onNavigate={() => undefined}
        />
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() =>
              setMobileMenuOpen(false)
            }
            className="absolute inset-0 bg-black/20"
          />

          <aside className="relative h-full w-[280px] overflow-y-auto bg-white shadow-xl">
            <button
              type="button"
              onClick={() =>
                setMobileMenuOpen(false)
              }
              className="absolute right-4 top-4 rounded-lg p-2 text-[#726874]"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>

            <SidebarContent
              pathname={pathname}
              groups={visibleNavigation}
              onNavigate={() =>
                setMobileMenuOpen(false)
              }
            />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[250px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-[#ebe4ec] bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setMobileMenuOpen(true)
              }
              className="rounded-lg border border-[#e7dde9] p-2 text-[#5f5560] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#36133b]">
                Planorahub CRM
              </p>

              <p className="mt-1 hidden text-sm text-[#817681] sm:block">
                Operations Management System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">
                {profile.first_name}{' '}
                {profile.last_name}
              </p>

              <p className="mt-0.5 text-xs text-[#817681]">
                {profile.role_name}
              </p>
            </div>

            <Link
              href={`/staff/${profile.id}`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f1eaf3] text-sm font-bold uppercase text-[#36133b] transition hover:ring-4 hover:ring-[#f4eff6]"
              title="My profile"
            >
              {initials}
            </Link>

            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#e7dde9] text-[#726874] transition hover:bg-[#f4eff6] hover:text-[#36133b]"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="p-5 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  groups,
  onNavigate,
}: {
  pathname: string;
  groups: NavigationGroup[];
  onNavigate: () => void;
}) {
  return (
    <>
      <div className="flex h-[94px] items-center border-b border-[#eee8ef] px-5">
        <Image
          src="/planorahub.png"
          alt="Planorahub CRM"
          width={600}
          height={300}
          priority
          className="h-auto w-[155px] object-contain"
        />
      </div>

      <div className="space-y-5 px-3 py-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a095a1]">
              {group.label}
            </p>

            <nav className="space-y-1">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(
                    `${item.href}/`,
                  );

                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={[
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                      active
                        ? 'bg-[#f4eff6] text-[#36133b]'
                        : 'text-[#675f68] hover:bg-[#faf7fb] hover:text-[#36133b]',
                    ].join(' ')}
                  >
                    <Icon
                      size={18}
                      strokeWidth={1.8}
                    />

                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </>
  );
}
