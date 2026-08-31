import Link from 'next/link';

import { Icon } from '@/components/ui/icon';
import type { NavigationItem as Item } from './navigation.types';

export function NavItem({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: Item;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const accessibleLabel = item.disabled
    ? `${item.label} — coming soon`
    : item.label;

  const content = (
    <>
      <span className="nav-icon">
        <Icon name={item.icon} />
      </span>

      <span className="nav-label">
        <span>{item.label}</span>

        {item.disabled ? (
          <span className="coming-soon">Soon</span>
        ) : null}
      </span>
    </>
  );

  return (
    <li>
      {item.href && !item.disabled ? (
        <Link
          className="nav-item"
          data-active={active}
          href={item.href}
          aria-label={collapsed ? accessibleLabel : undefined}
          aria-current={active ? 'page' : undefined}
          onClick={onNavigate}
        >
          {content}
        </Link>
      ) : (
        <span
          className="nav-item"
          data-disabled="true"
          aria-label={collapsed ? accessibleLabel : undefined}
          aria-disabled="true"
          tabIndex={collapsed ? 0 : undefined}
        >
          {content}
        </span>
      )}
    </li>
  );
}
