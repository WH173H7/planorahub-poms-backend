'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { crmSearch, type SearchResult } from '@/lib/workspace/ops-api';

function searchKindIcon(kind: string): IconName {
  switch (kind.toLowerCase()) {
    case 'organization':
      return 'organizations';
    case 'lead':
      return 'leads';
    case 'contact':
      return 'contacts';
    case 'prospect':
      return 'prospects';
    case 'client':
      return 'clients';
    case 'task':
      return 'tasks';
    case 'staff':
      return 'staff';
    case 'file':
      return 'file';
    default:
      return 'search';
  }
}

function searchKindLabel(kind: string) {
  return kind.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SearchResults({
  rows,
  busy,
  onPick,
}: {
  rows: SearchResult[];
  busy: boolean;
  onPick: () => void;
}) {
  if (busy) {
    return (
      <div className="global-search-state global-search-loading" role="status">
        <span className="global-search-spinner" aria-hidden="true" />
        <span>Searching PlanoraHub…</span>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="global-search-state global-search-empty">
        <span className="global-search-empty-icon" aria-hidden="true"><Icon name="search" /></span>
        <strong>No matching records</strong>
        <span>Try a company, lead, contact, staff member or task name.</span>
      </div>
    );
  }

  return (
    <div className="global-search-results">
      <div className="global-search-results-head">
        <span>Search results</span>
        <span>{rows.length} {rows.length === 1 ? 'result' : 'results'}</span>
      </div>

      <div className="global-search-results-list">
        {rows.map((result) => (
          <Link
            key={`${result.kind}-${result.id}`}
            href={result.href}
            className="global-search-result"
            onClick={onPick}
          >
            <span className="global-search-symbol" aria-hidden="true">
              <Icon name={searchKindIcon(result.kind)} width={18} height={18} />
            </span>

            <span className="global-search-copy">
              <span className="global-search-kind">{searchKindLabel(result.kind)}</span>
              <strong>{result.title}</strong>
              {result.subtitle ? <small>{result.subtitle}</small> : null}
            </span>

            <span className="global-search-open" aria-hidden="true">
              <Icon name="chevron" width={16} height={16} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<SearchResult[]>([]);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const desktopInput = useRef<HTMLInputElement>(null);
  const mobileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) {
        setRows([]);
        setBusy(false);
        return;
      }

      setBusy(true);
      try {
        setRows(await crmSearch(query));
      } finally {
        setBusy(false);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.innerWidth <= 1100) {
          setMobileOpen(true);
          window.setTimeout(() => mobileInput.current?.focus(), 0);
        } else {
          setDesktopOpen(true);
          desktopInput.current?.focus();
        }
      }

      if (event.key === 'Escape') {
        setDesktopOpen(false);
        setMobileOpen(false);
      }
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setDesktopOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => mobileInput.current?.focus(), 0);
    return () => {
      document.body.style.overflow = oldOverflow;
    };
  }, [mobileOpen]);

  const closeAndReset = () => {
    setDesktopOpen(false);
    setMobileOpen(false);
    setQuery('');
    setRows([]);
  };

  return (
    <>
      <div ref={wrap} className="global-search desktop-global-search">
        <div className="search-placeholder">
          <Icon name="search" />
          <input
            ref={desktopInput}
            aria-label="Search CRM"
            value={query}
            onFocus={() => setDesktopOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setDesktopOpen(true);
            }}
            placeholder="Search CRM"
          />
          <kbd>⌘K</kbd>
        </div>

        {desktopOpen && query.trim().length >= 2 ? (
          <div className="global-search-popover">
            <SearchResults rows={rows} busy={busy} onPick={closeAndReset} />
          </div>
        ) : null}
      </div>

      <button
        className="mobile-search-trigger"
        type="button"
        aria-label="Search CRM"
        onClick={() => setMobileOpen(true)}
      >
        <Icon name="search" />
      </button>

      {mobileOpen ? (
        <div className="mobile-search-shell" role="dialog" aria-modal="true" aria-label="Search CRM">
          <div className="mobile-search-header">
            <div className="mobile-search-input-wrap">
              <Icon name="search" />
              <input
                ref={mobileInput}
                aria-label="Search CRM"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search leads, tasks, staff, files…"
              />
            </div>
            <button type="button" className="mobile-search-close" onClick={() => setMobileOpen(false)}>
              Done
            </button>
          </div>
          <div className="mobile-search-content">
            {query.trim().length >= 2 ? (
              <SearchResults rows={rows} busy={busy} onPick={closeAndReset} />
            ) : (
              <div className="global-search-state">Type at least 2 characters to search the CRM.</div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
