'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import { PageErrorState } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  createRole,
  deleteRole,
  getRoleOverview,
  listPermissions,
  listRoles,
  updateRole,
  type Permission,
  type Role,
} from '@/lib/staff/api';
import { PermissionChecklist } from './permission-checklist';

export function RoleEditorPage({ roleId }: { roleId?: string }) {
  const router = useRouter();
  const isNew = !roleId;
  const [role, setRole] = useState<Role | null>(null);
  const [roleRows, setRoleRows] = useState<Role[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replacementRoleId, setReplacementRoleId] = useState('');
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setError(null);
      try {
        const [permissionRows, fetchedRoles] = await Promise.all([
          listPermissions(),
          isNew ? Promise.resolve([] as Role[]) : listRoles(),
        ]);
        if (!active) return;
        setPermissions(permissionRows);
        setRoleRows(fetchedRoles);
        if (!isNew) {
          const found = fetchedRoles.find((item) => item.id === roleId);
          if (!found) throw new Error('Role not found.');
          setRole(found);
          setName(found.name);
          setDescription(found.description ?? '');
          setSelected(found.permissions?.map((permission) => permission.id) ?? []);
          try { setOverview(await getRoleOverview(found.id)); } catch { setOverview(null); }
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load role access.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [isNew, roleId]);

  const protectedRole = Boolean(role?.is_system_role);
  const lockedName = protectedRole;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedModules = useMemo(
    () => new Set(permissions.filter((permission) => selectedSet.has(permission.id)).map((permission) => permission.module || 'general')).size,
    [permissions, selectedSet],
  );

  const roleDependencies = Number(overview?.role?.staff_count || 0) + Number(overview?.associations?.workflows || 0);
  const replacementRoles = roleRows.filter((item) => item.id !== role?.id && item.code !== 'SUPER_ADMIN' && item.is_active !== false);

  async function toggleRoleStatus() {
    if (!role || role.is_system_role) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateRole(role.id, { isActive: role.is_active === false });
      setRole(updated);
      setOverview((current: any) => current ? { ...current, role: { ...current.role, is_active: updated.is_active } } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update role status.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRole() {
    if (!role || deleteText !== 'DELETE') return;
    if (roleDependencies > 0 && !replacementRoleId) {
      setError('Choose an active replacement role before deleting this role.');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteRole(role.id, replacementRoleId || null);
      router.push('/staff#roles');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete role.');
      setDeleting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (role) {
        if (role.is_system_role) {
          router.push('/staff#roles');
          return;
        }
        await updateRole(role.id, {
          ...(lockedName ? {} : { name }),
          description,
          permissionIds: selected,
        });
      } else {
        await createRole({ name, description, permissionIds: selected });
      }
      router.push('/staff#roles');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save role.');
      setSaving(false);
    }
  }

  return (
    <AppShell
      area="admin"
      title={isNew ? 'Create Role' : role ? `Configure ${role.name}` : 'Role Access'}
      breadcrumb="Staff & Access"
      description={isNew
        ? 'Define a reusable access profile, then review every permission before assigning the role to staff.'
        : 'Review this role’s identity and access from a dedicated workspace with room to inspect every permission.'}
      actions={
        <div className="role-page-header-actions">
          <Button variant="outline" onClick={() => router.push('/staff#roles')}>Cancel</Button>
          {!protectedRole ? <Button loading={saving} onClick={() => void save()} disabled={!name.trim() || loading}>Save role</Button> : null}
        </div>
      }
    >
      {loading ? <Skeleton height={560} /> : error && !permissions.length ? <PageErrorState message={error} /> : (
        <div className="role-page-layout">
          <div className="role-page-main">
            <Card className="role-page-identity-card">
              <div className="ui-card-content">
                <div className="role-page-card-heading">
                  <div>
                    <span className="eyebrow">Role identity</span>
                    <h2>{isNew ? 'Name this access profile' : 'Role details'}</h2>
                    <p className="ui-help">Keep the role name clear enough that an admin can understand its purpose before opening the permission list.</p>
                  </div>
                  {role?.is_system_role ? <Badge tone="info">Built in</Badge> : role ? <Badge tone="neutral">Custom</Badge> : <Badge tone="success">New role</Badge>}
                </div>
                <div className="role-page-identity-grid">
                  <Input label="Role name *" value={name} disabled={lockedName} onChange={(event) => setName(event.target.value)} required />
                  <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
                </div>
                {protectedRole ? <p className="role-page-note">{role?.name} is a protected PlanoraHub system role. Its fixed access can be reviewed here but is not edited from the custom-role workflow.</p> : null}
              </div>
            </Card>

            {!isNew && overview ? (
              <Card className="role-operational-card">
                <div className="ui-card-content">
                  <div className="role-page-card-heading">
                    <div>
                      <span className="eyebrow">Operational footprint</span>
                      <h2>Where this role is connected</h2>
                      <p className="ui-help">People, departments and work rules currently relying on this role.</p>
                    </div>
                    <Badge tone={overview.role?.is_active === false ? 'warning' : 'success'}>{overview.role?.is_active === false ? 'Suspended' : 'Active'}</Badge>
                  </div>
                  <div className="role-operational-stats">
                    <div><span>Staff</span><strong>{overview.staff?.length || 0}</strong></div>
                    <div><span>Departments</span><strong>{overview.departments?.length || 0}</strong></div>
                    <div><span>Workflows</span><strong>{overview.associations?.workflows || 0}</strong></div>
                    <div><span>Shared items</span><strong>{overview.associations?.shared_items || 0}</strong></div>
                  </div>
                  <div className="role-operational-columns">
                    <section>
                      <div className="role-operational-heading"><strong>Assigned people</strong><span>{overview.staff?.length || 0}</span></div>
                      <div className="role-operational-list">
                        {(overview.staff || []).slice(0, 8).map((person: any) => (
                          <div key={person.id}><span className="structure-overview-avatar">{`${person.first_name?.[0] || ''}${person.last_name?.[0] || ''}`.toUpperCase()}</span><span><strong>{person.first_name} {person.last_name}</strong><small>{person.job_title || person.department_name || person.email}</small></span><Badge tone={person.status === 'ACTIVE' ? 'success' : 'neutral'}>{person.status}</Badge></div>
                        ))}
                        {!overview.staff?.length ? <p className="ui-help">No staff currently use this role.</p> : null}
                      </div>
                    </section>
                    <section>
                      <div className="role-operational-heading"><strong>Departments</strong><span>{overview.departments?.length || 0}</span></div>
                      <div className="role-operational-list">
                        {(overview.departments || []).slice(0, 8).map((department: any) => (
                          <div key={department.id}><span className="structure-overview-icon">D</span><span><strong>{department.name}</strong><small>{department.description || 'Department scope'}</small></span><Badge tone={department.is_active ? 'success' : 'neutral'}>{department.is_active ? 'Active' : 'Suspended'}</Badge></div>
                        ))}
                        {!overview.departments?.length ? <p className="ui-help">No department scopes are attached.</p> : null}
                      </div>
                    </section>
                  </div>
                  <section className="role-activity-panel">
                    <div className="role-operational-heading"><strong>Recent activity</strong><span>{overview.activity?.length || 0}</span></div>
                    <div className="structure-activity-list">
                      {(overview.activity || []).slice(0, 8).map((item: any) => (
                        <div key={item.id}><i aria-hidden="true" /><span><strong>{String(item.action || 'Activity').replaceAll('_', ' ')}</strong><small>{[item.first_name, item.last_name].filter(Boolean).join(' ') || 'System'} · {item.created_at ? new Date(item.created_at).toLocaleString() : 'Recently'}</small></span></div>
                      ))}
                      {!overview.activity?.length ? <p className="ui-help">No recent role activity yet.</p> : null}
                    </div>
                  </section>
                </div>
              </Card>
            ) : null}

            <Card className="role-page-permission-card">
              <div className="ui-card-content">
                <div className="role-page-card-heading role-page-permission-heading">
                  <div>
                    <span className="eyebrow">Access permissions</span>
                    <h2>Choose what this role can do</h2>
                    <p className="ui-help">Work module by module. Staff assigned to this role inherit these permissions by default, and individual overrides can still be reviewed during staff creation.</p>
                  </div>
                  <Badge tone="info">{selected.length} selected</Badge>
                </div>
                <PermissionChecklist
                  permissions={permissions}
                  selectedIds={selected}
                  onToggle={(id, checked) => { if (!protectedRole) setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)); }}
                />
              </div>
            </Card>
          </div>

          <aside className="role-page-side">
            <Card className="role-page-summary-card">
              <div className="ui-card-content">
                <span className="eyebrow">Access summary</span>
                <h3>{name.trim() || 'Untitled role'}</h3>
                <p className="ui-help">Review the scope before saving this role.</p>
                <div className="role-page-summary-grid">
                  <div><span>Permissions</span><strong>{selected.length}</strong></div>
                  <div><span>Modules touched</span><strong>{selectedModules}</strong></div>
                  <div><span>Available access</span><strong>{permissions.length}</strong></div>
                  <div><span>Status</span><strong>{role?.is_active === false ? 'Suspended' : 'Active'}</strong></div>
                </div>
                <div className="role-page-summary-tip">
                  <strong>Keep access intentional.</strong>
                  <span>Choose the minimum permissions this role needs. You can customize a specific person later without changing everyone on the role.</span>
                </div>
                {!isNew && role && !role.is_system_role ? (
                  <div className="role-lifecycle-actions">
                    <Button variant="outline" onClick={() => void toggleRoleStatus()} disabled={saving}>{role?.is_active === false ? 'Reactivate role' : 'Suspend role'}</Button>
                    {!role?.is_system_role ? <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete role</Button> : null}
                  </div>
                ) : null}
                {error ? <p className="task-form-error">{error}</p> : null}
                <div className="role-page-side-actions">
                  <Button variant="outline" onClick={() => router.push('/staff#roles')}>Cancel</Button>
                  {!protectedRole ? <Button loading={saving} onClick={() => void save()} disabled={!name.trim()}>Save role</Button> : null}
                </div>
              </div>
            </Card>
          </aside>
        </div>
      )}

      {deleteOpen && role ? (
        <Modal open onClose={() => setDeleteOpen(false)} title={`Delete ${role.name}`} className="role-delete-dialog">
          <div className="stack">
            <div className="structure-delete-panel__intro">
              <strong>Permanent role deletion</strong>
              <p className="ui-help">{roleDependencies > 0 ? 'This role is still connected to staff or workflows. Reassign those connections before deletion.' : 'This role has no blocking staff or workflow connections.'}</p>
            </div>
            {roleDependencies > 0 ? (
              <NativeSelect label="Replacement role *" value={replacementRoleId} onChange={(event) => setReplacementRoleId(event.target.value)}>
                <option value="">Choose replacement…</option>
                {replacementRoles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </NativeSelect>
            ) : null}
            <Input label="Type DELETE to confirm" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" />
            <div className="polish-actions">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Keep role</Button>
              <Button variant="danger" loading={deleting} disabled={deleteText !== 'DELETE' || (roleDependencies > 0 && !replacementRoleId)} onClick={() => void removeRole()}>Permanently delete</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </AppShell>
  );
}
