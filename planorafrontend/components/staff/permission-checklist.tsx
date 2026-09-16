'use client';

import { useMemo, useState } from 'react';
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

  const visibleCount = groups.reduce((total, group) => total + group.items.length, 0);
  const totalModules = new Set(permissions.map((permission) => permission.module?.trim() || 'general')).size;

  return (
    <div className="permission-browser-v3">
      <div className="permission-browser-v3__summary">
        <div><span>Available</span><strong>{permissions.length}</strong><small>permissions</small></div>
        <div><span>Selected</span><strong>{selectedIds.length}</strong><small>effective access</small></div>
        <div><span>Modules</span><strong>{totalModules}</strong><small>access areas</small></div>
      </div>

      <div className="permission-browser-v3__toolbar">
        <div className="permission-browser-v3__search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search permissions, modules or access codes…"
            aria-label="Search permissions"
          />
        </div>
        <button
          type="button"
          className={selectedOnly ? 'permission-browser-v3__filter is-active' : 'permission-browser-v3__filter'}
          onClick={() => setSelectedOnly((value) => !value)}
          aria-pressed={selectedOnly}
        >
          {selectedOnly ? 'Showing selected' : 'Selected only'}
        </button>
      </div>

      <div className="permission-browser-v3__meta">
        <span>{visibleCount} permission{visibleCount === 1 ? '' : 's'} shown</span>
        <span>Expand a module to review access.</span>
      </div>

      <div className="permission-browser-v3__groups">
        {groups.map(({ module, items }, index) => {
          const selectedInGroup = items.filter((item) => selected.has(item.id)).length;
          const allSelected = items.length > 0 && selectedInGroup === items.length;
          const shouldOpen = Boolean(needle) || selectedOnly || index === 0;

          return (
            <details className="permission-module-v3" key={module} open={shouldOpen ? true : undefined}>
              <summary>
                <span className="permission-module-v3__icon" aria-hidden="true">›</span>
                <span className="permission-module-v3__title">
                  <strong>{human(module)}</strong>
                  <small>{selectedInGroup} of {items.length} selected</small>
                </span>
                <span className="permission-module-v3__meter" aria-hidden="true"><i style={{ width: `${items.length ? Math.round((selectedInGroup / items.length) * 100) : 0}%` }} /></span>
                {!readOnly && onToggle ? (
                  <button
                    type="button"
                    className="permission-module-v3__bulk"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      items.forEach((item) => onToggle(item.id, !allSelected));
                    }}
                  >
                    {allSelected ? 'Clear' : 'Select all'}
                  </button>
                ) : null}
              </summary>

              <div className="permission-module-v3__list">
                {items.map((permission) => {
                  const checked = selected.has(permission.id);
                  return (
                    <label key={permission.id} className={checked ? 'permission-option-v3 is-selected' : 'permission-option-v3'}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={readOnly}
                        onChange={(event) => onToggle?.(permission.id, event.target.checked)}
                      />
                      <span className="permission-option-v3__copy">
                        <strong>{permissionLabel(permission)}</strong>
                        <small>{permission.description?.trim() || fallbackDescription(permission)}</small>
                      </span>
                      <code>{permission.code || 'permission'}</code>
                    </label>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {!visibleCount ? (
        <div className="permission-browser-v3__empty">
          <strong>{selectedOnly ? 'No selected permissions match this view.' : 'No permissions match your search.'}</strong>
          <span>{selectedOnly ? 'Turn off “Selected only” to see the complete access catalogue.' : 'Try another permission or module name.'}</span>
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
