import { NavItem } from './nav-item';
import type { NavigationSection } from './navigation.types';

function isRouteActive(path: string, href?: string) {
  if (!href) return false;
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

export function NavSection({
  section,
  path,
  collapsed,
  onNavigate,
}: {
  section: NavigationSection;
  path: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const sectionId = `nav-${section.label.replaceAll(' ', '-')}`;

  return (
    <section className="nav-section" aria-labelledby={sectionId}>
      <h2 id={sectionId} className="nav-section-title">
        {section.label.toUpperCase()}
      </h2>
      <ul className="nav-list">
        {section.items.map((item) => (
          <NavItem
            key={item.label}
            item={item}
            active={isRouteActive(path, item.href)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </section>
  );
}
