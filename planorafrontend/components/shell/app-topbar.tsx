'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { GlobalSearch } from '@/components/shell/global-search';
import { supabase } from '@/lib/supabase/client';
import type { CrmUser } from '@/types/auth';
import { NotificationCenter } from '@/components/workspace-ops/notification-center';
import { routeForUser } from '@/lib/auth/routing';

export function AppTopbar({
  user,
  title,
  onOpenNavigation,
}: {
  user: CrmUser;
  title: string;
  onOpenNavigation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace('/login');
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Button
          variant="ghost"
          iconOnly
          className="mobile-trigger"
          aria-label="Open navigation"
          onClick={onOpenNavigation}
        >
          <Icon name="menu" />
        </Button>
        <Link href={routeForUser(user)} className="topbar-brand-link" aria-label={`PlanoraHub home · ${title}`}>
          <Image src="/planorahub.png" alt="PlanoraHub" width={132} height={62} priority className="topbar-brand-logo" />
        </Link>
      </div>

      <div className="topbar-actions">
        <GlobalSearch />
        <NotificationCenter />
        <div ref={wrap} className="user-menu-wrap">
          <button
            className="user-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <Avatar name={`${user.first_name} ${user.last_name}`} />
            <span className="user-meta">
              <strong>{user.first_name} {user.last_name}</strong>
              <span>{user.role_name}</span>
            </span>
            <span className="user-menu-chevron" aria-hidden="true">
              <Icon name="chevron" width={16} height={16} />
            </span>
          </button>

          {open ? (
            <div className="dropdown-panel user-dropdown" role="menu">
              <div className="user-dropdown-summary">
                <Avatar name={`${user.first_name} ${user.last_name}`} />
                <div>
                  <strong>{user.first_name} {user.last_name}</strong>
                  <span>{user.role_name}</span>
                </div>
              </div>
              <button className="dropdown-item" role="menuitem" onClick={logout}>
                <Icon name="logout" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
