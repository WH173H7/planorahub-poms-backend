'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import { routeForUser } from '@/lib/auth/routing';

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: string;
  actions?: ReactNode;
}) {
  async function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    try {
      const user = await getCurrentCrmUser();
      window.location.assign(routeForUser(user));
    } catch {
      window.location.assign('/login');
    }
  }

  return (
    <header className="page-header">
      <div className="page-header-main">
        <button className="page-back-button" type="button" onClick={goBack} aria-label="Go back" title="Go back">
          <Icon name="back" />
        </button>
        <div className="page-header-copy">
          {breadcrumb ? <div className="breadcrumb">{breadcrumb}</div> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function PageSection({ children }: { children: ReactNode }) {
  return <section className="page-section">{children}</section>;
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function ResponsiveGrid({ children }: { children: ReactNode }) {
  return <div className="responsive-grid">{children}</div>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
