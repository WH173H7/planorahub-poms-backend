'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const initialized = useRef(false);
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
    if (initialized.current || !permissions.length) return;
    const firstSelectedModule = permissions.find((permission) => selected.has(permission.id))?.module?.trim();
    const firstModule = firstSelectedModule || permissions[0]?.module?.trim() || 'general';
    setOpenModules(new Set([firstModule]));
    initialized.current = true;
  }, [permissions, selected]);

  const visibleCount = groups.reduce((total, group) => total + group.items.length, 0);
  const totalModules = new Set(permissions.map((permission) => permission.module?.trim() || 'general')).size;

  const toggleModule = (module: string) => {
    setOpenModules((current) => {
      const next = new Set(current);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  return (
    <div className="permission-browser-v2">
      <div className="permission-browser-v2__summary">
        <div>
          <span>Available</span>
          <strong>{permissions.length}</strong>
          <small>permissions</small>
        </div>
        <div>
          <span>Selected</span>
          <strong>{selectedIds.length}</strong>
          <small>for this role</small>
        </div>
        <div>
          <span>Modules</span>
          <strong>{totalModules}</strong>
          <small>access areas</small>
        </div>
      </div>

      <div className="permission-browser-v2__toolbar">
        <label className="permission-browser-v2__search">
          <span className="sr-only">Search permissions</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search permissions, modules or access codes…"
          />
        </label>
        <button
          type="button"
          className={selectedOnly ? 'permission-browser-v2__filter is-active' : 'permission-browser-v2__filter'}
          onClick={() => setSelectedOnly((value) => !value)}
          aria-pressed={selectedOnly}
        >
          {selectedOnly ? 'Showing selected' : 'Selected only'}
        </button>
      </div>

      <div className="permission-browser-v2__meta">
        <span>{visibleCount} permission{visibleCount === 1 ? '' : 's'} shown</span>
        <span>Choose the minimum access this role needs.</span>
      </div>

      <div className="permission-browser-v2__groups">
        {groups.map(({ module, items }) => {
          const selectedInGroup = items.filter((item) => selected.has(item.id)).length;
          const allSelected = items.length > 0 && selectedInGroup === items.length;
          const expanded = Boolean(needle) || openModules.has(module);

          return (
            <section className={expanded ? 'permission-module is-open' : 'permission-module'} key={module}>
              <div className="permission-module__head">
                <button
                  type="button"
                  className="permission-module__toggle"
                  onClick={() => toggleModule(module)}
                  aria-expanded={expanded}
                >
                  <span className="permission-module__chevron" aria-hidden="true">›</span>
                  <span className="permission-module__title">
                    <strong>{human(module)}</strong>
                    <small>{selectedInGroup} of {items.length} selected</small>
                  </span>
                  <span className="permission-module__progress" aria-hidden="true">
                    <i style={{ width: `${items.length ? Math.round((selectedInGroup / items.length) * 100) : 0}%` }} />
                  </span>
                </button>
                {!readOnly && onToggle ? (
                  <button
                    type="button"
                    className="permission-module__action"
                    onClick={() => items.forEach((item) => onToggle(item.id, !allSelected))}
                  >
                    {allSelected ? 'Clear all' : 'Select all'}
                  </button>
                ) : null}
              </div>

              {expanded ? (
                <div className="permission-module__list">
                  {items.map((permission) => {
                    const checked = selected.has(permission.id);
                    const label = permissionLabel(permission);
                    const detail = permission.description?.trim() || fallbackDescription(permission);

                    return (
                      <button
                        key={permission.id}
                        type="button"
                        className={checked ? 'permission-row is-selected' : 'permission-row'}
                        aria-pressed={checked}
                        disabled={readOnly}
                        onClick={() => onToggle?.(permission.id, !checked)}
                      >
                        <span className="permission-row__check" aria-hidden="true">{checked ? '✓' : ''}</span>
                        <span className="permission-row__copy">
                          <strong>{label}</strong>
                          <small>{detail}</small>
                        </span>
                        <code>{permission.code || 'permission'}</code>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {!visibleCount ? (
        <div className="permission-browser-v2__empty">
          <strong>{selectedOnly ? 'No selected permissions match this view.' : 'No permissions match your search.'}</strong>
          <span>{selectedOnly ? 'Turn off “Selected only” or select permissions from a module.' : 'Try a module name such as Leads, Tasks, Staff or Analytics.'}</span>
        </div>
      ) : null}
    </div>
  );
}

function permissionLabel(permission: Permission) {
  return permission.name?.trim() || human(permission.code || 'Permission');
}

function fallbackDescription(permission: Permission) {
  const label = permissionLabel(permission).toLowerCase();
  return `Allows this role to ${label}.`;
}

function human(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('.', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
