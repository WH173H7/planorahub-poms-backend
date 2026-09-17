'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { updateRole, type Permission, type Role } from '@/lib/staff/api';

export function RoleManagement({
  roles,
  permissions,
  onReload,
}: {
  roles: Role[];
  permissions: Permission[];
  onReload: () => Promise<void>;
}) {
  const visible = useMemo(
    () => roles.filter((role) => ['MARKETING', 'FINANCE'].includes(role.code) || (!role.is_system_role && role.code !== 'SUPER_ADMIN')),
    [roles],
  );
  const active = visible.filter((role) => role.is_active !== false);
  const assigned = visible.reduce((total, role) => total + (role.staff_count ?? 0), 0);

  return (
    <div className="roles-workspace">
      <div className="section-heading role-workspace-heading">
        <div>
          <span className="eyebrow">Access management</span>
          <h2>Roles & permissions</h2>
          <p className="ui-help">
            Create reusable access profiles for PlanoraHub staff. Marketing and Finance are protected built-in roles; custom roles inherit only the permissions you select.
          </p>
        </div>
        <Link href="/staff/roles/new"><Button>+ Create role</Button></Link>
      </div>

      <div className="role-overview-strip">
        <div><span>Active roles</span><strong>{active.length}</strong></div>
        <div><span>Custom roles</span><strong>{visible.filter((role) => !role.is_system_role).length}</strong></div>
        <div><span>Staff assigned</span><strong>{assigned}</strong></div>
        <div><span>Available permissions</span><strong>{permissions.length}</strong></div>
      </div>

      <div className="role-card-grid">
        {visible.map((role) => (
          <Card key={role.id} className={!role.is_active ? 'role-card is-archived' : 'role-card'}>
            <div className="ui-card-content">
              <div className="role-card-top">
                <div>
                  <div className="role-card-badges">
                    {role.is_system_role ? <Badge tone="info">Built in</Badge> : <Badge tone="neutral">Custom</Badge>}
                    {!role.is_active ? <Badge tone="warning">Archived</Badge> : <Badge tone="success">Active</Badge>}
                  </div>
                  <h3>{role.name}</h3>
                  <p className="ui-help">{role.description || 'No description yet.'}</p>
                </div>
                <div className="role-count"><strong>{role.permissions?.length ?? 0}</strong><span>permissions</span></div>
              </div>
              <div className="role-card-meta">
                <span><strong>{role.staff_count ?? 0}</strong> staff assigned</span>
                <span>{role.is_active ? 'Available when creating staff' : 'Hidden from new staff setup'}</span>
              </div>
              <div className="role-card-actions">
                <Link href={`/staff/roles/${role.id}`}>
                  <Button variant="outline">{role.is_system_role ? 'Review access' : 'Edit role'}</Button>
                </Link>
                {!role.is_system_role ? (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await updateRole(role.id, { isActive: !role.is_active });
                      await onReload();
                    }}
                  >
                    {role.is_active ? 'Archive' : 'Reactivate'}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {!visible.length ? (
        <Card>
          <div className="ui-card-content staff-empty-action">
            <h2>No staff roles yet</h2>
            <p className="ui-help">Create your first role and choose the permissions it should inherit.</p>
            <div><Link href="/staff/roles/new"><Button>Create role</Button></Link></div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
