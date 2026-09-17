'use client';

import { useEffect, useRef } from 'react';
import type { NavigationSection } from '@/components/navigation/navigation.types';
import { AppSidebar } from './app-sidebar';

export function MobileNavigation({
  open,
  onClose,
  navigation,
  path,
}: {
  open: boolean;
  onClose: () => void;
  navigation: NavigationSection[];
  path: string;
}) {
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    drawer.current?.focus();

    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="mobile-navigation" data-open={open} aria-hidden={!open}>
      <button
        className="mobile-backdrop"
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <div
        ref={drawer}
        className="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        tabIndex={-1}
      >
        <AppSidebar
          navigation={navigation}
          path={path}
          collapsed={false}
          mobile
          onNavigate={onClose}
        />
      </div>
    </div>
  );
}
