'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getAuditFeed, type AuditItem } from '@/lib/delivery/api';

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
  item.actor_email ||
  'System';

export function AuditView() {
  const [rows, setRows] = useState<AuditItem[]>([]);
  const [query, setQuery] = useState('');
  const [actor, setActor] = useState('ALL');

  useEffect(() => {
    let active = true;
    getAuditFeed().then((items) => {
      if (active) setRows(items);
    });
    return () => {
      active = false;
    };
  }, []);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((item) => {
      if (item.actor_user_id) map.set(item.actor_user_id, actorName(item));
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter((item) => {
        if (actor !== 'ALL' && item.actor_user_id !== actor) return false;
        if (!query.trim()) return true;
        return [
          item.action,
          item.module,
          item.entity_type,
          item.actor_first_name,
          item.actor_last_name,
          item.actor_email,
          item.actor_role_name,
          item.actor_department_name,
          item.ip_address,
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
      description="App-wide security, account and meaningful CRM action history across Admin and Staff."
    >
      <div className="page-stack audit-page">
        <Card>
          <div className="ui-card-content audit-filter-grid">
            <Input
              label="Search logs"
              placeholder="Action, staff, module, email or IP…"
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
            Showing <strong>{visible.length}</strong> of {rows.length} recent audit events. Staff task,
            Lead, Contact, pursuit, chat, reminder and authenticated-session actions appear here.
          </div>

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
                    <th>Entity</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td>{fmt(item.created_at)}</td>
                      <td>
                        <strong>{actorName(item)}</strong>
                        {item.actor_email ? <div className="ui-help">{item.actor_email}</div> : null}
                      </td>
                      <td>
                        {item.actor_role_name || '—'}
                        {item.actor_department_name ? (
                          <div className="ui-help">{item.actor_department_name}</div>
                        ) : null}
                      </td>
                      <td>{human(item.action)}</td>
                      <td><Badge tone="neutral">{item.module}</Badge></td>
                      <td>
                        {item.entity_type}
                        {item.entity_id ? <div className="ui-help">{item.entity_id.slice(0, 8)}…</div> : null}
                      </td>
                      <td>{item.ip_address || '—'}</td>
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
                  <div>
                    <dt>Actor</dt>
                    <dd>{actorName(item)}</dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{item.actor_role_name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Department</dt>
                    <dd>{item.actor_department_name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Entity</dt>
                    <dd>{item.entity_type}{item.entity_id ? ` · ${item.entity_id.slice(0, 8)}…` : ''}</dd>
                  </div>
                  <div>
                    <dt>IP</dt>
                    <dd>{item.ip_address || '—'}</dd>
                  </div>
                </dl>
                {item.actor_email ? <small>{item.actor_email}</small> : null}
              </article>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
