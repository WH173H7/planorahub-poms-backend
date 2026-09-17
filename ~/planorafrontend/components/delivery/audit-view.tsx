'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getAuditFeed, type AuditItem } from '@/lib/delivery/api';

const PAGE_SIZE = 250;

const fmt = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

const human = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const actorName = (item: AuditItem) =>
  [item.actor_first_name, item.actor_last_name].filter(Boolean).join(' ') ||
  item.actor_name_snapshot ||
  item.actor_email ||
  item.actor_email_snapshot ||
  'System';

const pretty = (value: unknown) => {
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const looksLikeIsoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));

const auditValue = (value: unknown): string => {
  if (value == null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return looksLikeIsoDate(value) ? fmt(value) : value;
  if (Array.isArray(value)) {
    if (!value.length) return 'None';
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) return value.join(', ');
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  return 'Updated record';
};

const flattenAuditContext = (
  value: unknown,
  prefix = '',
  depth = 0,
): Array<{ label: string; value: string }> => {
  if (value == null) return [];
  if (depth > 2 || typeof value !== 'object' || Array.isArray(value)) {
    return [{ label: prefix || 'Value', value: auditValue(value) }];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const label = prefix ? `${prefix} · ${human(key)}` : human(key);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return flattenAuditContext(nested, label, depth + 1);
    }
    return [{ label, value: auditValue(nested) }];
  });
};

function AuditContext({ before, after }: { before: unknown; after: unknown }) {
  const groups = [
    { title: 'Before', value: before },
    { title: 'After / context', value: after },
  ].filter((group) => group.value != null);

  return (
    <div className="audit-context-stack">
      {groups.map((group) => {
        const entries = flattenAuditContext(group.value);
        return (
          <section className="audit-context-panel" key={group.title}>
            <div className="audit-context-title">{group.title}</div>
            {entries.length ? (
              <div className="audit-context-grid">
                {entries.map((entry, index) => (
                  <div className="audit-context-row" key={`${entry.label}-${index}`}>
                    <span>{entry.label}</span>
                    <strong>{entry.value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="audit-context-empty">No additional details.</div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function AuditView() {
  const [rows, setRows] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [actor, setActor] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAuditFeed(PAGE_SIZE, 0)
      .then((page) => {
        if (!active) return;
        setRows(page.items);
        setTotal(page.total);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load audit logs.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadOlder() {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await getAuditFeed(PAGE_SIZE, rows.length);
      setRows((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      setTotal(page.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load older audit logs.');
    } finally {
      setLoadingMore(false);
    }
  }

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((item) => {
      const id = item.actor_user_id || item.actor_user_id_snapshot;
      if (id) map.set(id, actorName(item));
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter((item) => {
        if (actor !== 'ALL' && (item.actor_user_id || item.actor_user_id_snapshot) !== actor) return false;
        if (!query.trim()) return true;
        return [
          item.action,
          item.module,
          item.entity_type,
          item.actor_first_name,
          item.actor_last_name,
          item.actor_email,
          item.actor_role_name,
          item.actor_role_snapshot,
          item.actor_department_name,
          item.actor_department_snapshot,
          item.actor_email_snapshot,
          item.ip_address,
          item.user_agent,
          pretty(item.old_values),
          pretty(item.new_values),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [rows, query, actor],
  );

  return (
    <AppShell
      area="admin"
      title="Audit Logs"
      breadcrumb="Insights"
      description="Security, account and meaningful CRM activity across Admin, Staff and background operations."
    >
      <div className="page-stack audit-page">
        <Card>
          <div className="ui-card-content audit-filter-grid">
            <Input
              label="Search logs"
              placeholder="Action, staff, module, email, IP or change…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <NativeSelect
              label="Staff / actor"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
            >
              <option value="ALL">All actors</option>
              {actors.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </Card>

        <Card className="audit-results-card">
          <div className="audit-result-summary">
            {loading ? 'Loading audit trail…' : (
              <>Showing <strong>{visible.length}</strong> matching events from <strong>{rows.length}</strong> loaded of <strong>{total}</strong> stored audit records.</>
            )}
          </div>

          {error ? <div className="ui-card-content"><p className="ui-error">{error}</p></div> : null}

          <div className="audit-desktop-table">
            <div className="table-wrap audit-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Role / department</th>
                    <th>Action</th>
                    <th>Module</th>
                    <th>Entity / change</th>
                    <th>Network / device</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td>{fmt(item.created_at)}</td>
                      <td>
                        <strong>{actorName(item)}</strong>
                        {(item.actor_email || item.actor_email_snapshot) ? <div className="ui-help">{item.actor_email || item.actor_email_snapshot}</div> : null}
                      </td>
                      <td>
                        {item.actor_role_name || item.actor_role_snapshot || ((item.actor_user_id || item.actor_user_id_snapshot) ? '—' : 'System process')}
                        {(item.actor_department_name || item.actor_department_snapshot) ? <div className="ui-help">{item.actor_department_name || item.actor_department_snapshot}</div> : null}
                      </td>
                      <td>{human(item.action)}</td>
                      <td><Badge tone="neutral">{item.module}</Badge></td>
                      <td>
                        {item.entity_type}
                        {item.entity_id ? <div className="ui-help">{item.entity_id.slice(0, 8)}…</div> : null}
                        {(item.old_values || item.new_values) ? (
                          <details className="audit-detail-disclosure">
                            <summary>View change</summary>
                            <AuditContext before={item.old_values} after={item.new_values} />
                          </details>
                        ) : null}
                      </td>
                      <td>
                        {item.ip_address || '—'}
                        {item.user_agent ? <div className="ui-help" title={item.user_agent}>{item.user_agent.slice(0, 64)}{item.user_agent.length > 64 ? '…' : ''}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="audit-mobile-list">
            {visible.map((item) => (
              <article className="audit-mobile-card" key={item.id}>
                <header>
                  <div>
                    <strong>{human(item.action)}</strong>
                    <span>{fmt(item.created_at)}</span>
                  </div>
                  <Badge tone="neutral">{item.module}</Badge>
                </header>
                <dl>
                  <div><dt>Actor</dt><dd>{actorName(item)}</dd></div>
                  <div><dt>Role</dt><dd>{item.actor_role_name || item.actor_role_snapshot || ((item.actor_user_id || item.actor_user_id_snapshot) ? '—' : 'System process')}</dd></div>
                  <div><dt>Department</dt><dd>{item.actor_department_name || item.actor_department_snapshot || '—'}</dd></div>
                  <div><dt>Entity</dt><dd>{item.entity_type}{item.entity_id ? ` · ${item.entity_id.slice(0, 8)}…` : ''}</dd></div>
                  <div><dt>IP</dt><dd>{item.ip_address || '—'}</dd></div>
                </dl>
                {(item.actor_email || item.actor_email_snapshot) ? <small>{item.actor_email || item.actor_email_snapshot}</small> : null}
                {item.user_agent ? <small>{item.user_agent}</small> : null}
                {(item.old_values || item.new_values) ? (
                  <details className="audit-detail-disclosure">
                    <summary>View audit context</summary>
                    <AuditContext before={item.old_values} after={item.new_values} />
                  </details>
                ) : null}
              </article>
            ))}
          </div>

          {rows.length < total ? (
            <div className="ui-card-content" style={{ display: 'flex', justifyContent: 'center' }}>
              <Button variant="outline" loading={loadingMore} onClick={() => void loadOlder()}>Load older events</Button>
            </div>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
