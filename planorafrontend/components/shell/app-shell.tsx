'use client';

import type { FocusEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] =
    useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    async function authorize() {
      try {
        const current = await getCurrentCrmUser();
        const admin = hasAdministrativeAccess(current);

        if (
          (area === 'admin' && !admin) ||
          (area === 'staff' && admin)
        ) {
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

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const expandDesktopSidebar = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    setDesktopSidebarExpanded(true);
  }, []);

  const scheduleDesktopSidebarCollapse = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }

    collapseTimerRef.current = setTimeout(() => {
      setDesktopSidebarExpanded(false);
    }, 220);
  }, []);

  const handleSidebarBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;

      if (
        nextTarget instanceof Node &&
        event.currentTarget.contains(nextTarget)
      ) {
        return;
      }

      scheduleDesktopSidebarCollapse();
    },
    [scheduleDesktopSidebarCollapse],
  );

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
    area === 'admin' || (area === 'auto' && hasAdministrativeAccess(user)) ? adminNavigation : staffNavigation;

  const hour = new Date().getHours();

  const greeting =
    hour < 12
      ? 'Good morning'
      : hour < 18
        ? 'Good afternoon'
        : 'Good evening';

  const personal =
    personalize === 'welcome'
      ? `Welcome back, ${user.first_name}.`
      : personalize === 'greeting'
        ? `${greeting}, ${user.first_name}.`
        : '';

  return (
    <div
      className="app-shell"
      data-sidebar-expanded={desktopSidebarExpanded}
    >
      <div
        className="desktop-sidebar"
        onPointerEnter={expandDesktopSidebar}
        onPointerLeave={scheduleDesktopSidebarCollapse}
        onFocusCapture={expandDesktopSidebar}
        onBlurCapture={handleSidebarBlur}
      >
        <AppSidebar
          navigation={navigation}
          path={path}
          collapsed={!desktopSidebarExpanded}
        />
      </div>

      <MobileNavigation
        open={mobileOpen}
        onClose={closeMobile}
        navigation={navigation}
        path={path}
      />

      <div className="app-main">
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
