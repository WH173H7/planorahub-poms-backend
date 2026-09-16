'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { adminNavigation } from '@/components/navigation/admin-navigation';
import { staffNavigation } from '@/components/navigation/staff-navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import { hasAdministrativeAccess, routeForUser } from '@/lib/auth/routing';
import type { CrmUser } from '@/types/auth';

import { AppSidebar } from './app-sidebar';
import { AppTopbar } from './app-topbar';
import { MobileNavigation } from './mobile-navigation';
import { PageContainer } from './page-container';
import { PageHeader } from './page-layout';
import { FloatingChat } from '@/components/workspace-ops/floating-chat';

type AppShellProps = {
  area: 'admin' | 'staff' | 'auto';
  title: string;
  description?: string;
  personalize?: 'welcome' | 'greeting';
  breadcrumb?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const SIDEBAR_KEY = 'planorahub.sidebar.collapsed';

export function AppShell({
  area,
  title,
  description,
  personalize,
  breadcrumb,
  actions,
  children,
}: AppShellProps) {
  const path = usePathname();
  const [user, setUser] = useState<CrmUser | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_KEY);
    if (saved === 'true' || saved === 'false') {
      setSidebarCollapsed(saved === 'true');
      return;
    }

    setSidebarCollapsed(window.innerWidth < 1180);
  }, []);

  useEffect(() => {
    async function authorize() {
      try {
        const current = await getCurrentCrmUser();
        if (current.must_change_password) {
          window.location.replace('/change-password');
          return;
        }
        const admin = hasAdministrativeAccess(current);

        if ((area === 'admin' && !admin) || (area === 'staff' && admin)) {
          window.location.replace(routeForUser(current));
          return;
        }

        setUser(current);
      } catch {
        window.location.replace('/login');
      }
    }

    void authorize();
  }, [area]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }, []);

  const expandSidebarFromNavigation = useCallback(() => {
    if (!sidebarCollapsed) return;
    setSidebarCollapsed(false);
    window.localStorage.setItem(SIDEBAR_KEY, 'false');
  }, [sidebarCollapsed]);

  const collapseSidebarFromPageInteraction = useCallback(() => {
    if (sidebarCollapsed) return;
    setSidebarCollapsed(true);
    window.localStorage.setItem(SIDEBAR_KEY, 'true');
  }, [sidebarCollapsed]);

  if (!user) {
    return (
      <main className="centered-page" aria-busy="true">
        <div style={{ width: 320 }} className="stack">
          <Skeleton height={32} />
          <Skeleton height={120} />
        </div>
      </main>
    );
  }

  const navigation =
    area === 'admin' || (area === 'auto' && hasAdministrativeAccess(user))
      ? adminNavigation
      : staffNavigation;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const personal =
    personalize === 'welcome'
      ? `Welcome back, ${user.first_name}.`
      : personalize === 'greeting'
        ? `${greeting}, ${user.first_name}.`
        : '';

  return (
    <div className="app-shell" data-sidebar-collapsed={sidebarCollapsed}>
      <div className="desktop-sidebar">
        <AppSidebar
          navigation={navigation}
          path={path}
          collapsed={sidebarCollapsed}
          onNavigate={expandSidebarFromNavigation}
          onToggleCollapsed={toggleSidebar}
        />
      </div>

      <MobileNavigation
        open={mobileOpen}
        onClose={closeMobile}
        navigation={navigation}
        path={path}
      />

      <div className="app-main" onClick={collapseSidebarFromPageInteraction}>
        <AppTopbar
          user={user}
          title={title}
          onOpenNavigation={() => setMobileOpen(true)}
        />

        <main className="app-content">
          <PageContainer>
            <PageHeader
              title={title}
              breadcrumb={breadcrumb}
              description={`${personal} ${description ?? ''}`.trim()}
              actions={actions}
            />
            {children}
          </PageContainer>
        </main>
      </div>

      <FloatingChat />
    </div>
  );
}
