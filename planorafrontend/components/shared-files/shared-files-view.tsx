'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import {
  approveSharedFolder,
  createSharedFolder,
  downloadSharedFile,
  listSharedFiles,
  listSharedFolderScopes,
  listSharedFolders,
  uploadSharedFile,
  type SharedFolderScopes,
} from '@/lib/workspace/ops-api';

type Folder = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  visibility_ids: string[];
  publication_status: 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'REJECTED';
  file_count: number;
  first_name?: string;
  last_name?: string;
};

type SharedFile = {
  id: string;
  file_name: string;
  file_size: number;
  first_name?: string;
  last_name?: string;
};

export function SharedFilesView() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<Folder | null>(null);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [open, setOpen] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [user, rows] = await Promise.all([getCurrentCrmUser(), listSharedFolders()]);
      setCanCreate(user.role_code === 'SUPER_ADMIN' || user.permissions.includes('shared_files.create'));
      setCanApprove(user.role_code === 'SUPER_ADMIN' || user.permissions.includes('shared_files.approve'));
      setFolders(rows as Folder[]);
      setSelected((current) => current ? (rows.find((row: any) => row.id === current.id) as Folder | undefined) ?? null : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Shared Files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function choose(folder: Folder) {
    setSelected(folder);
    setBusy(true);
    setError(null);
    try {
      setFiles(await listSharedFiles(folder.id) as SharedFile[]);
    } catch (caught) {
      setFiles([]);
      setError(caught instanceof Error ? caught.message : 'Unable to open this folder.');
    } finally {
      setBusy(false);
    }
  }

  async function review(status: 'PUBLISHED' | 'REJECTED') {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await approveSharedFolder(selected.id, status) as Folder;
      setSelected(updated);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to review this folder.');
    } finally {
      setBusy(false);
    }
  }

  async function upload(file?: File) {
    if (!selected || !file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadSharedFile(selected.id, file);
      setFiles(await listSharedFiles(selected.id) as SharedFile[]);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to upload this file.');
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = folders.filter((folder) => folder.publication_status === 'PENDING').length;
  const publishedCount = folders.filter((folder) => folder.publication_status === 'PUBLISHED').length;

  return (
    <AppShell
      area="auto"
      title="Shared Files"
      breadcrumb="Communication"
      description="Controlled operational folders shared with specific staff, Departments, Teams, Leads, Tasks or everyone."
      actions={canCreate ? <Button onClick={() => setOpen(true)}>+ New folder</Button> : undefined}
    >
      <div className="page-stack">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="shared-files-kpis">
          <Card><div className="ui-card-content"><span className="eyebrow">Accessible folders</span><strong className="shared-files-kpi-value">{folders.length}</strong><small className="ui-help">Folders you can currently open</small></div></Card>
          <Card><div className="ui-card-content"><span className="eyebrow">Published</span><strong className="shared-files-kpi-value">{publishedCount}</strong><small className="ui-help">Available to their approved audience</small></div></Card>
          <Card><div className="ui-card-content"><span className="eyebrow">Awaiting approval</span><strong className="shared-files-kpi-value">{pendingCount}</strong><small className="ui-help">Wider staff publication requests</small></div></Card>
        </div>

        <div className="shared-files-layout">
          <Card>
            <div className="ui-card-content shared-files-folder-list">
              <div className="shared-files-list-head">
                <div><span className="eyebrow">Workspace</span><h2>Folders</h2></div>
                {loading ? <small className="ui-help">Loading…</small> : null}
              </div>
              {!loading && !folders.length ? <p className="ui-help">No shared folders are available yet.</p> : null}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  className={selected?.id === folder.id ? 'shared-folder-row is-active' : 'shared-folder-row'}
                  onClick={() => void choose(folder)}
                >
                  <span className="shared-folder-icon">▣</span>
                  <span className="shared-folder-copy">
                    <strong>{folder.name}</strong>
                    <small>{visibilityLabel(folder.visibility)} · {folder.file_count ?? 0} file{Number(folder.file_count) === 1 ? '' : 's'}</small>
                  </span>
                  <span className={`shared-folder-status status-${folder.publication_status.toLowerCase()}`}>{statusLabel(folder.publication_status)}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="ui-card-content shared-files-detail">
              {selected ? (
                <>
                  <header className="shared-files-detail-head">
                    <div>
                      <span className="eyebrow">{visibilityLabel(selected.visibility)}</span>
                      <h2>{selected.name}</h2>
                      <p className="ui-help">{selected.description || 'Shared operational files.'}</p>
                      <small className="ui-help">Created by {[selected.first_name, selected.last_name].filter(Boolean).join(' ') || 'PlanoraHub staff'} · {statusLabel(selected.publication_status)}</small>
                    </div>
                    <div className="shared-files-actions">
                      {canApprove && selected.publication_status === 'PENDING' ? (
                        <>
                          <Button variant="outline" disabled={busy} onClick={() => void review('REJECTED')}>Reject</Button>
                          <Button disabled={busy} onClick={() => void review('PUBLISHED')}>Approve</Button>
                        </>
                      ) : null}
                      {canCreate ? (
                        <>
                          <input ref={fileRef} type="file" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
                          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>Upload file</Button>
                        </>
                      ) : null}
                    </div>
                  </header>

                  {selected.publication_status === 'PENDING' ? (
                    <Alert tone="info">This folder is waiting for Super Admin approval before its wider audience can access it. The creator and approvers can still review it.</Alert>
                  ) : null}
                  {selected.publication_status === 'REJECTED' ? (
                    <Alert tone="error">This folder was not approved for wider publication. Its creator can still see it.</Alert>
                  ) : null}

                  <div className="shared-files-file-list">
                    {busy && !files.length ? <p className="ui-help">Loading files…</p> : null}
                    {files.length ? files.map((file) => (
                      <div key={file.id} className="shared-file-row">
                        <span className="shared-file-icon">↗</span>
                        <div>
                          <strong>{file.file_name}</strong>
                          <small className="ui-help">{formatSize(Number(file.file_size))} · {[file.first_name, file.last_name].filter(Boolean).join(' ') || 'PlanoraHub staff'}</small>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            setError(null);
                            try {
                              const result = await downloadSharedFile(file.id);
                              window.open(result.url, '_blank', 'noopener,noreferrer');
                            } catch (caught) {
                              setError(caught instanceof Error ? caught.message : 'Unable to download this file.');
                            }
                          }}
                        >
                          Download
                        </Button>
                      </div>
                    )) : !busy ? <div className="shared-files-empty"><strong>No files yet</strong><p className="ui-help">Upload the first file to this folder.</p></div> : null}
                  </div>
                </>
              ) : (
                <div className="shared-files-empty large">
                  <span>▣</span>
                  <strong>Select a folder</strong>
                  <p className="ui-help">Choose a folder on the left to view its files, publication state and sharing scope.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {open ? <FolderModal close={() => setOpen(false)} saved={async () => { setOpen(false); await load(); }} /> : null}
    </AppShell>
  );
}

function FolderModal({ close, saved }: { close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('PRIVATE');
  const [ids, setIds] = useState<string[]>([]);
  const [scopes, setScopes] = useState<SharedFolderScopes | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listSharedFolderScopes()
      .then((rows) => { if (active) setScopes(rows); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load sharing options.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => { setIds([]); }, [visibility]);

  const options = useMemo(() => scopeOptions(scopes, visibility), [scopes, visibility]);
  const needsTargets = !['PRIVATE', 'EVERYONE'].includes(visibility);

  return (
    <Modal open onClose={close} title="New shared folder">
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (needsTargets && !ids.length) { setError('Choose at least one sharing target.'); return; }
          setSaving(true);
          setError(null);
          try {
            await createSharedFolder({ name, description, visibility, visibilityIds: ids });
            await saved();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to create this folder.');
            setSaving(false);
          }
        }}
      >
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input label="Folder name *" value={name} onChange={(event) => setName(event.target.value)} required />
        <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        <NativeSelect label="Who can see this?" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
          <option value="PRIVATE">Only me</option>
          <option value="EVERYONE">Everyone</option>
          <option value="SELECTED">Selected staff</option>
          <option value="DEPARTMENT">Department</option>
          <option value="TEAM">Team</option>
          <option value="LEAD">People associated with a Lead</option>
          <option value="TASK">People associated with a Task</option>
        </NativeSelect>

        {needsTargets ? (
          <div className="shared-scope-picker">
            <div className="shared-scope-picker-head">
              <div><strong>{scopeHeading(visibility)}</strong><small className="ui-help">Select one or more. Staff-created wider folders are sent for Super Admin approval.</small></div>
              <span>{ids.length} selected</span>
            </div>
            {!scopes ? <p className="ui-help">Loading available options…</p> : options.length ? options.map((option) => (
              <label key={option.id} className="shared-scope-option">
                <input
                  type="checkbox"
                  checked={ids.includes(option.id)}
                  onChange={(event) => setIds((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))}
                />
                <span><strong>{option.label}</strong>{option.subtitle ? <small>{option.subtitle}</small> : null}</span>
              </label>
            )) : <p className="ui-help">No options are available for this scope.</p>}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>Create folder</Button>
        </div>
      </form>
    </Modal>
  );
}

function scopeOptions(scopes: SharedFolderScopes | null, visibility: string) {
  if (!scopes) return [] as Array<{ id: string; label: string; subtitle?: string }>;
  if (visibility === 'SELECTED') return scopes.staff.map((row) => ({ id: row.id, label: `${row.first_name} ${row.last_name}`, subtitle: row.job_title || 'Staff' }));
  if (visibility === 'DEPARTMENT') return scopes.departments.map((row) => ({ id: row.id, label: row.name, subtitle: 'Department' }));
  if (visibility === 'TEAM') return scopes.teams.map((row) => ({ id: row.id, label: row.name, subtitle: 'Cross-department Team' }));
  if (visibility === 'LEAD') return scopes.leads.map((row) => ({ id: row.id, label: row.title, subtitle: row.subtitle?.replaceAll('_', ' ') || 'Lead' }));
  if (visibility === 'TASK') return scopes.tasks.map((row) => ({ id: row.id, label: row.title, subtitle: row.subtitle?.replaceAll('_', ' ') || 'Task' }));
  return [];
}

function scopeHeading(visibility: string) {
  return ({ SELECTED: 'Select staff', DEPARTMENT: 'Select Departments', TEAM: 'Select Teams', LEAD: 'Select Leads', TASK: 'Select Tasks' } as Record<string, string>)[visibility] || 'Select audience';
}

function visibilityLabel(value: string) {
  return ({ PRIVATE: 'Private', EVERYONE: 'Everyone', SELECTED: 'Selected staff', DEPARTMENT: 'Department', TEAM: 'Team', LEAD: 'Lead participants', TASK: 'Task participants' } as Record<string, string>)[value] || value;
}

function statusLabel(value: Folder['publication_status']) {
  return ({ DRAFT: 'Draft', PENDING: 'Pending approval', PUBLISHED: 'Published', REJECTED: 'Rejected' } as Record<string, string>)[value] || value;
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
