'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageErrorState } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  createRole,
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
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setError(null);
      try {
        const [permissionRows, roleRows] = await Promise.all([
          listPermissions(),
          isNew ? Promise.resolve([] as Role[]) : listRoles(),
        ]);
        if (!active) return;
        setPermissions(permissionRows);
        if (!isNew) {
          const found = roleRows.find((item) => item.id === roleId);
          if (!found) throw new Error('Role not found.');
          setRole(found);
          setName(found.name);
          setDescription(found.description ?? '');
          setSelected(found.permissions?.map((permission) => permission.id) ?? []);
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

  const lockedName = role?.code === 'MARKETING';
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedModules = useMemo(
    () => new Set(permissions.filter((permission) => selectedSet.has(permission.id)).map((permission) => permission.module || 'general')).size,
    [permissions, selectedSet],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (role) {
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
          <Button loading={saving} onClick={() => void save()} disabled={!name.trim() || loading}>Save role</Button>
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
                  {role?.code === 'MARKETING' ? <Badge tone="info">Built in</Badge> : role ? <Badge tone="neutral">Custom</Badge> : <Badge tone="success">New role</Badge>}
                </div>
                <div className="role-page-identity-grid">
                  <Input label="Role name *" value={name} disabled={lockedName} onChange={(event) => setName(event.target.value)} required />
                  <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
                </div>
                {lockedName ? <p className="role-page-note">Marketing is PlanoraHub’s built-in staff role. Its name stays fixed, but its default permissions can still be reviewed here.</p> : null}
              </div>
            </Card>

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
                  onToggle={(id, checked) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))}
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
                  <div><span>Status</span><strong>{role?.is_active === false ? 'Archived' : 'Active'}</strong></div>
                </div>
                <div className="role-page-summary-tip">
                  <strong>Keep access intentional.</strong>
                  <span>Choose the minimum permissions this role needs. You can customize a specific person later without changing everyone on the role.</span>
                </div>
                {error ? <p className="task-form-error">{error}</p> : null}
                <div className="role-page-side-actions">
                  <Button variant="outline" onClick={() => router.push('/staff#roles')}>Cancel</Button>
                  <Button loading={saving} onClick={() => void save()} disabled={!name.trim()}>Save role</Button>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
