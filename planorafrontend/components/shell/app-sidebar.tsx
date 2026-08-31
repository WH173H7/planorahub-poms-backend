'use client';

import { useEffect, useRef } from 'react';

import { NavSection } from '@/components/navigation/nav-section';
import type { NavigationSection } from '@/components/navigation/navigation.types';
import { Icon } from '@/components/ui/icon';

type AppSidebarProps = {
  navigation: NavigationSection[];
  path: string;
  collapsed: boolean;
  onNavigate?: () => void;
  mobile?: boolean;
};

export function AppSidebar({
  navigation,
  path,
  collapsed,
  onNavigate,
  mobile = false,
}: AppSidebarProps) {
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = navigationRef.current;

    if (!element || mobile) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (reducedMotion) return;

    let frame = 0;
    let previous = performance.now();
    let direction: 1 | -1 = 1;
    let pointerInside = false;
    let pausedUntil = 0;

    const pauseTemporarily = (milliseconds = 2500) => {
      pausedUntil = performance.now() + milliseconds;
    };

    const onPointerEnter = () => {
      pointerInside = true;
      previous = performance.now();
    };

    const onPointerLeave = () => {
      pointerInside = false;
    };

    const onWheel = () => {
      pauseTemporarily();
    };

    const onTouchStart = () => {
      pauseTemporarily();
    };

    const onFocusIn = () => {
      pauseTemporarily(3500);
    };

    const drift = (now: number) => {
      const overflowing = element.scrollHeight > element.clientHeight + 2;

      if (
        pointerInside &&
        overflowing &&
        now >= pausedUntil
      ) {
        const delta = Math.min(now - previous, 50);

        // Very slow CRM-style drift: approximately 7px per second.
        element.scrollTop += direction * (delta / 1000) * 7;

        const maxScroll = element.scrollHeight - element.clientHeight;

        if (element.scrollTop >= maxScroll - 1) {
          element.scrollTop = maxScroll;
          direction = -1;
          pauseTemporarily(900);
        } else if (element.scrollTop <= 1) {
          element.scrollTop = 0;
          direction = 1;
          pauseTemporarily(900);
        }
      }

      previous = now;
      frame = requestAnimationFrame(drift);
    };

    element.addEventListener('pointerenter', onPointerEnter);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('focusin', onFocusIn);

    frame = requestAnimationFrame(drift);

    return () => {
      cancelAnimationFrame(frame);

      element.removeEventListener('pointerenter', onPointerEnter);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('focusin', onFocusIn);
    };
  }, [mobile]);

  return (
    <aside className="sidebar" aria-label="Application navigation">
      <div className="sidebar-brand">
        <span className="brand-mark">P</span>

        <span className="brand-copy">
          Planora<span>Hub</span>
        </span>

        {mobile ? (
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={onNavigate}
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>

      <nav ref={navigationRef} className="sidebar-nav">
        {navigation.map((section) => (
          <NavSection
            key={section.label}
            section={section}
            path={path}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </aside>
  );
}
