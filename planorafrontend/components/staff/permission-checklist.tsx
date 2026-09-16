'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Permission } from '@/lib/staff/api';

export function PermissionChecklist({
  permissions,
  selectedIds,
  onToggle,
  readOnly = false,
}: {
  permissions: Permission[];
  selectedIds: string[];
  onToggle?: (permissionId: string, checked: boolean) => void;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const needle = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const filtered = permissions.filter((permission) => {
      if (selectedOnly && !selected.has(permission.id)) return false;
      if (!needle) return true;
      return [permission.name, permission.code, permission.module, permission.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });

    const grouped = filtered.reduce<Record<string, Permission[]>>((acc, permission) => {
      const module = permission.module?.trim() || 'general';
      (acc[module] ??= []).push(permission);
      return acc;
    }, {});

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, items]) => ({
        module,
        items: [...items].sort((a, b) => permissionLabel(a).localeCompare(permissionLabel(b))),
      }));
  }, [permissions, needle, selectedOnly, selected]);

  useEffect(() => {
    if (!groups.length) return;
    setOpenModules((current) => {
      if (Object.keys(current).length) return current;
      return { [groups[0].module]: true };
    });
  }, [groups]);

  useEffect(() => {
    if (!needle && !selectedOnly) return;
    setOpenModules((current) => {
      const next = { ...current };
      groups.forEach((group) => { next[group.module] = true; });
      return next;
    });
  }, [needle, selectedOnly, groups]);

  const visibleCount = groups.reduce((total, group) => total + group.items.length, 0);
  const totalModules = new Set(permissions.map((permission) => permission.module?.trim() || 'general')).size;

  return (
    <div className="permission-browser-v4">
      <div className="permission-browser-v4__summary">
        <div><span>Available</span><strong>{permissions.length}</strong><small>permissions</small></div>
        <div><span>Selected</span><strong>{selectedIds.length}</strong><small>effective access</small></div>
        <div><span>Modules</span><strong>{totalModules}</strong><small>access areas</small></div>
      </div>

      <div className="permission-browser-v4__toolbar">
        <label className="permission-browser-v4__search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search permissions, modules or access codes…"
            aria-label="Search permissions"
          />
        </label>
        <button
          type="button"
          className={selectedOnly ? 'permission-browser-v4__filter is-active' : 'permission-browser-v4__filter'}
          onClick={() => setSelectedOnly((value) => !value)}
          aria-pressed={selectedOnly}
        >
          {selectedOnly ? 'Showing selected' : 'Selected only'}
        </button>
      </div>

      <div className="permission-browser-v4__meta">
        <span>{visibleCount} permission{visibleCount === 1 ? '' : 's'} shown</span>
        <span>Open a module to review its access.</span>
      </div>

      <div className="permission-browser-v4__groups">
        {groups.map(({ module, items }) => {
          const selectedInGroup = items.filter((item) => selected.has(item.id)).length;
          const allSelected = items.length > 0 && selectedInGroup === items.length;
          const isOpen = Boolean(openModules[module]);
          const pct = items.length ? Math.round((selectedInGroup / items.length) * 100) : 0;

          return (
            <section className={isOpen ? 'permission-module-v4 is-open' : 'permission-module-v4'} key={module}>
              <div className="permission-module-v4__head">
                <button
                  type="button"
                  className="permission-module-v4__toggle"
                  onClick={() => setOpenModules((current) => ({ ...current, [module]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  <span className="permission-module-v4__chevron" aria-hidden="true">›</span>
                  <span className="permission-module-v4__title">
                    <strong>{human(module)}</strong>
                    <small>{selectedInGroup} of {items.length} selected</small>
                  </span>
                  <span className="permission-module-v4__meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                </button>
                {!readOnly && onToggle ? (
                  <button
                    type="button"
                    className="permission-module-v4__bulk"
                    onClick={() => items.forEach((item) => onToggle(item.id, !allSelected))}
                  >
                    {allSelected ? 'Clear module' : 'Select all'}
                  </button>
                ) : null}
              </div>

              {isOpen ? (
                <div className="permission-module-v4__list">
                  {items.map((permission) => {
                    const checked = selected.has(permission.id);
                    return (
                      <label key={permission.id} className={checked ? 'permission-option-v4 is-selected' : 'permission-option-v4'}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={readOnly}
                          onChange={(event) => onToggle?.(permission.id, event.target.checked)}
                        />
                        <span className="permission-option-v4__copy">
                          <strong>{permissionLabel(permission)}</strong>
                          <small>{permission.description?.trim() || fallbackDescription(permission)}</small>
                        </span>
                        <code>{permission.code || 'permission'}</code>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {!visibleCount ? (
        <div className="permission-browser-v4__empty">
          <strong>{selectedOnly ? 'No selected permissions match this view.' : 'No permissions match your search.'}</strong>
          <span>{selectedOnly ? 'Turn off “Selected only” to see the full access catalogue.' : 'Try another permission, module or access code.'}</span>
        </div>
      ) : null}
    </div>
  );
}

function permissionLabel(permission: Permission) {
  return permission.name?.trim() || human(permission.code || 'Permission');
}

function fallbackDescription(permission: Permission) {
  return `Allows access to ${permissionLabel(permission).toLowerCase()}.`;
}

function human(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('.', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
