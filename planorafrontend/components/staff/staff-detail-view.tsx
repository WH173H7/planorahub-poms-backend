'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import {
  getStaff,
  listDepartments,
  listRoles,
  listTeams,
  resetStaffPassword,
  setStaffStatus,
  updateStaff,
  type Department,
  type MailDelivery,
  type Role,
} from '@/lib/staff/api';

type StaffProfile = Record<string, any>;

type EditForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  roleId: string;
  departmentId: string;
  teamId: string;
};

export function StaffDetailView({ staffId }: { staffId: string }) {
  const [item, setItem] = useState<StaffProfile | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [passwordDelivery, setPasswordDelivery] = useState<MailDelivery | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; department_id: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setItem(await getStaff(staffId));
  }

  useEffect(() => {
    let active = true;
    Promise.all([getStaff(staffId), listRoles(), listDepartments(), listTeams()]).then(
      ([profile, roleRows, departmentRows, teamRows]) => {
        if (!active) return;
        setItem(profile);
        setRoles(roleRows);
        setDepartments(departmentRows);
        setTeams(teamRows);
      },
    );
    return () => {
      active = false;
    };
  }, [staffId]);

  if (!item) {
    return (
      <AppShell area="admin" title="Staff" breadcrumb="Team">
        <Card><div className="ui-card-content">Loading staff profile…</div></Card>
      </AppShell>
    );
  }

  const name = `${item.first_name} ${item.last_name}`;

  async function action(kind: 'suspend' | 'disable' | 'reactivate') {
    setBusy(true);
    setMessage(null);
    try {
      await setStaffStatus(staffId, kind);
      await load();
      setMessage(kind === 'reactivate' ? 'Staff access is active.' : `Staff account ${kind}d.`);
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setMessage('Temporary password copied.');
  }

  return (
    <AppShell
      area="admin"
      title={name}
      breadcrumb="Team / Staff"
      description={`${item.job_title || item.role_name} · ${item.department_name || 'No department'}`}
      actions={<Link href="/staff"><Button variant="outline">← Staff</Button></Link>}
    >
      <div className="staff-360-grid">
        <Card>
          <div className="ui-card-content">
            <div className="staff-profile-head">
              <div className="staff-profile-avatar">{item.first_name?.[0]}{item.last_name?.[0]}</div>
              <div>
                <h2>{name}</h2>
                <p>{item.email}</p>
                <Badge tone={item.status === 'ACTIVE' ? 'success' : item.status === 'INVITED' ? 'warning' : 'danger'}>{item.status}</Badge>
              </div>
            </div>
            <div className="staff-facts">
              <div><span>Role</span><strong>{item.role_name}</strong></div>
              <div><span>Department</span><strong>{item.department_name || 'Unassigned'}</strong></div>
              <div><span>Teams</span><strong>{item.teams?.map((x: any) => x.name).join(', ') || 'None'}</strong></div>
              <div><span>Last login</span><strong>{item.last_login_at ? new Date(item.last_login_at).toLocaleString() : 'Not yet'}</strong></div>
            </div>
            <div className="staff-profile-actions">
              <Button variant="outline" onClick={() => setEditOpen(true)}>Edit staff profile</Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="ui-card-content">
            <span className="eyebrow">Account controls</span>
            <h2>Access & security</h2>
            <p className="ui-help">New accounts use a temporary password and remain Invited until the staff member creates a new password. Admin resets can optionally email the new temporary password. Suspending or disabling preserves all CRM history.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button variant="outline" disabled={busy} onClick={() => setResetOpen(true)}>
                {item.status === 'INVITED' ? 'Issue new temporary password' : 'Reset password'}
              </Button>
              {item.status === 'ACTIVE' ? (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => void action('suspend')}>Suspend</Button>
                  <Button variant="outline" disabled={busy} onClick={() => void action('disable')}>Disable account</Button>
                </>
              ) : item.status === 'SUSPENDED' || item.status === 'DISABLED' ? (
                <Button disabled={busy} onClick={() => void action('reactivate')}>Reactivate</Button>
              ) : null}
            </div>

            {password ? (
              <div className="temporary-password-box">
                <strong>Temporary password</strong>
                <div className="temporary-password-line">
                  <code>{password}</code>
                  <Button size="sm" variant="outline" onClick={() => void copyPassword()}>Copy</Button>
                </div>
                <small>This value is shown only for this admin session. The staff member must change it before accessing CRM data.</small>
                {passwordDelivery ? <small className={`credential-delivery credential-delivery--${passwordDelivery.status.toLowerCase()}`}>{passwordDelivery.message}</small> : null}
              </div>
            ) : null}
            {message ? <p className="ui-help">{message}</p> : null}
          </div>
        </Card>

        <Card className="staff-wide">
          <div className="ui-card-content">
            <span className="eyebrow">System log</span>
            <h2>Staff activity & account history</h2>
            {item.audit_events?.length ? item.audit_events.slice(0, 20).map((event: any) => (
              <div className="staff-audit-row" key={event.id}>
                <div><strong>{String(event.action).replaceAll('_', ' ')}</strong><span>{event.module}</span></div>
                <small>{new Date(event.created_at).toLocaleString()}</small>
              </div>
            )) : <p className="ui-help">No activity recorded yet.</p>}
          </div>
        </Card>
      </div>

      {resetOpen ? (
        <ResetPasswordDialog
          staffName={name}
          staffEmail={item.email}
          onClose={() => setResetOpen(false)}
          onReset={async (sendEmail) => {
            const result = await resetStaffPassword(staffId, { sendEmail });
            setPassword(result.temporaryPassword);
            setPasswordDelivery(result.emailDelivery);
            setResetOpen(false);
            setMessage('A new temporary password has been issued. The previous password no longer works.');
            await load();
          }}
        />
      ) : null}

      {editOpen ? (
        <EditStaffDialog
          item={item}
          roles={roles}
          departments={departments}
          teams={teams}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await load();
            setMessage('Staff profile updated.');
          }}
        />
      ) : null}
    </AppShell>
  );
}

function ResetPasswordDialog({
  staffName,
  staffEmail,
  onClose,
  onReset,
}: {
  staffName: string;
  staffEmail: string;
  onClose: () => void;
  onReset: (sendEmail: boolean) => Promise<void>;
}) {
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal open onClose={onClose} title="Reset staff password">
      <div className="stack reset-password-dialog">
        <div>
          <strong>Issue a new temporary password for {staffName}?</strong>
          <p className="ui-help">Their current password will stop working immediately. They must create a new password before they can access the CRM again.</p>
        </div>
        <label className="reset-email-choice">
          <input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />
          <span><strong>Email the temporary password to staff</strong><small>{staffEmail}</small></span>
        </label>
        <p className="ui-help">The temporary password will always be shown once to the administrator after the reset, whether or not email is selected.</p>
        {error ? <p className="task-form-error">{error}</p> : null}
        <div className="polish-actions">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onReset(sendEmail);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Unable to reset password.');
                setSaving(false);
              }
            }}
          >Reset password</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditStaffDialog({
  item,
  roles,
  departments,
  teams,
  onClose,
  onSaved,
}: {
  item: StaffProfile;
  roles: Role[];
  departments: Department[];
  teams: Array<{ id: string; name: string; department_id: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initialTeamId = item.teams?.[0]?.id ?? '';
  const [form, setForm] = useState<EditForm>({
    firstName: item.first_name ?? '',
    lastName: item.last_name ?? '',
    email: item.email ?? '',
    phone: item.phone ?? '',
    jobTitle: item.job_title ?? '',
    roleId: item.role_id ?? '',
    departmentId: item.department_id ?? '',
    teamId: initialTeamId,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTeams = useMemo(() => teams, [teams]);

  function set<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Modal open onClose={onClose} title="Edit staff profile">
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await updateStaff(item.id, {
              firstName: form.firstName,
              lastName: form.lastName,
              email: form.email,
              phone: form.phone || null,
              jobTitle: form.jobTitle || null,
              roleId: form.roleId,
              departmentId: form.departmentId || null,
              teamIds: form.teamId ? [form.teamId] : [],
            });
            await onSaved();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to update staff profile.');
            setSaving(false);
          }
        }}
      >
        <div className="staff-edit-grid">
          <Input label="First name *" value={form.firstName} onChange={(event) => set('firstName', event.target.value)} required />
          <Input label="Last name *" value={form.lastName} onChange={(event) => set('lastName', event.target.value)} required />
          <Input label="Login email *" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} required />
          <Input label="Phone" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
          <Input label="Job title" value={form.jobTitle} onChange={(event) => set('jobTitle', event.target.value)} />
          <NativeSelect label="Role *" value={form.roleId} onChange={(event) => set('roleId', event.target.value)} required>
            {roles.filter((role) => role.id === item.role_id || (role.code !== 'SUPER_ADMIN' && role.is_active !== false)).map((role) => <option key={role.id} value={role.id}>{role.name}{role.is_active === false ? ' (archived)' : ''}</option>)}
          </NativeSelect>
          <NativeSelect
            label="Department"
            value={form.departmentId}
            onChange={(event) => {
              set('departmentId', event.target.value);
            }}
          >
            <option value="">No department</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </NativeSelect>
          <NativeSelect label="Team" value={form.teamId} onChange={(event) => set('teamId', event.target.value)}>
            <option value="">No team</option>
            {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </NativeSelect>
        </div>
        {error ? <p style={{ color: '#a42323' }}>{error}</p> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}
