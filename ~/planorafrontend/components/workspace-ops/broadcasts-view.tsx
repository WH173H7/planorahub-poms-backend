'use client';

import { useEffect, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { listRoles, listStaff } from '@/lib/staff/api';
import {
  createBroadcast,
  listBroadcasts,
  listManagedDepartments,
  listManagedTeams,
} from '@/lib/workspace/ops-api';

export function BroadcastsView() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setRows(await listBroadcasts());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load broadcasts.');
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  return (
    <AppShell
      area="admin"
      title="Broadcasts"
      breadcrumb="Communication"
      description="Send controlled company announcements by in-app notification, email, or both."
      actions={<Button onClick={() => setOpen(true)}>+ New broadcast</Button>}
    >
      <div className="page-stack broadcasts-page">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Card>
          <div className="ui-card-content broadcasts-card">
            <div className="broadcasts-head">
              <div>
                <span className="eyebrow">Company communication</span>
                <h2>Broadcast history</h2>
                <p className="ui-help">Track the audience and read reach of company-wide announcements.</p>
              </div>
              <Badge tone="purple">{rows.length} sent</Badge>
            </div>

            {rows.length ? (
              <div className="broadcast-list">
                {rows.map((row) => (
                  <article className="broadcast-row" key={row.id}>
                    <div className="broadcast-copy">
                      <div className="broadcast-title-line">
                        <strong>{row.title}</strong>
                        <Badge tone={priorityTone(row.priority)}>{human(row.priority)}</Badge>
                      </div>
                      <span>{human(row.channel)} · {human(row.audience_type)}</span>
                      <p>{row.body}</p>
                    </div>
                    <div className="broadcast-stats">
                      <div><strong>{row.recipient_count || 0}</strong><span>Recipients</span></div>
                      <div><strong>{row.read_count || 0}</strong><span>Read</span></div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="broadcast-empty">
                <strong>No broadcasts yet</strong>
                <p className="ui-help">Your first company announcement will appear here.</p>
                <Button variant="outline" onClick={() => setOpen(true)}>Create broadcast</Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {open ? (
        <BroadcastModal
          close={() => setOpen(false)}
          saved={async () => {
            setOpen(false);
            await load();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function BroadcastModal({ close, saved }: { close: () => void; saved: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [channel, setChannel] = useState('IN_APP');
  const [audienceType, setAudience] = useState('EVERYONE');
  const [ids, setIds] = useState<string[]>([]);
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIds([]);
    const go = async () => {
      try {
        setError(null);
        if (audienceType === 'DEPARTMENT') {
          setOptions(
            (await listManagedDepartments())
              .filter((item: any) => item.is_active)
              .map((item: any) => ({ id: item.id, name: item.name })),
          );
        } else if (audienceType === 'TEAM') {
          setOptions(
            (await listManagedTeams())
              .filter((item: any) => item.is_active)
              .map((item: any) => ({ id: item.id, name: item.name })),
          );
        } else if (audienceType === 'ROLE') {
          setOptions((await listRoles()).map((item) => ({ id: item.id, name: item.name })));
        } else if (audienceType === 'SELECTED') {
          setOptions(
            (await listStaff())
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => ({ id: item.id, name: `${item.first_name} ${item.last_name}` })),
          );
        } else {
          setOptions([]);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load audience options.');
      }
    };
    void go();
  }, [audienceType]);

  return (
    <Modal open title="New broadcast" onClose={close}>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await createBroadcast({ title, body, priority, channel, audienceType, audienceIds: ids });
            await saved();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to send broadcast.');
            setSaving(false);
          }
        }}
      >
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input label="Title *" value={title} onChange={(event) => setTitle(event.target.value)} required />
        <Textarea label="Announcement *" rows={6} value={body} onChange={(event) => setBody(event.target.value)} required />

        <div className="broadcast-form-grid">
          <NativeSelect label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option>NORMAL</option>
            <option>IMPORTANT</option>
            <option>URGENT</option>
          </NativeSelect>
          <NativeSelect label="Delivery" value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="IN_APP">In-app</option>
            <option value="EMAIL">Email</option>
            <option value="BOTH">In-app + Email</option>
          </NativeSelect>
          <NativeSelect label="Audience" value={audienceType} onChange={(event) => setAudience(event.target.value)}>
            <option value="EVERYONE">Everyone</option>
            <option value="DEPARTMENT">Department</option>
            <option value="TEAM">Team</option>
            <option value="ROLE">Role</option>
            <option value="SELECTED">Selected staff</option>
          </NativeSelect>
        </div>

        {audienceType !== 'EVERYONE' ? (
          <div>
            <div className="broadcast-picker-head">
              <strong>Choose recipients</strong>
              <span>{ids.length} selected</span>
            </div>
            <div className="broadcast-picker">
              {options.length ? options.map((option) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(option.id)}
                    onChange={(event) =>
                      setIds((current) =>
                        event.target.checked
                          ? [...current, option.id]
                          : current.filter((id) => id !== option.id),
                      )
                    }
                  />
                  <span>{option.name}</span>
                </label>
              )) : <p className="ui-help">No audience records are available for this selection.</p>}
            </div>
          </div>
        ) : null}

        {channel !== 'IN_APP' ? (
          <Alert tone="info">
            Email delivery is safely queued as PENDING_WORKSPACE until Google Workspace is connected. In-app delivery is available now.
          </Alert>
        ) : null}

        <div className="polish-actions">
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button
            loading={saving}
            disabled={audienceType !== 'EVERYONE' && !ids.length}
            type="submit"
          >
            Send broadcast
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function human(value: string) {
  return String(value || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function priorityTone(priority: string) {
  if (priority === 'URGENT') return 'danger' as const;
  if (priority === 'IMPORTANT') return 'warning' as const;
  return 'neutral' as const;
}
