'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import { createStaff, type MailDelivery, type Permission, type Role } from '@/lib/staff/api';
import { PermissionChecklist } from './permission-checklist';

type Department = { id: string; name: string; is_active: boolean };
type Team = { id: string; name: string; is_active: boolean };
type Form = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  roleId: string;
  departmentId: string;
  teamIds: string[];
};

export function CreateStaffWizard({
  roles,
  permissions,
  departments,
  teams,
  onClose,
  onCreated,
}: {
  roles: Role[];
  permissions: Permission[];
  departments: Department[];
  teams: Team[];
  onClose: () => void;
  onCreated: (result: { name: string; email: string; password: string; emailDelivery: MailDelivery }) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Form>({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', roleId: '', departmentId: '', teamIds: [] });
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignableRoles = roles.filter((role) => role.code !== 'SUPER_ADMIN' && role.is_active !== false);
  const selectedRole = assignableRoles.find((role) => role.id === form.roleId) ?? null;
  const selectedDepartment = departments.find((department) => department.id === form.departmentId);
  const selectedTeams = teams.filter((team) => form.teamIds.includes(team.id));
  const basePermissionIds = useMemo(() => new Set(selectedRole?.permissions?.map((permission) => permission.id) ?? []), [selectedRole]);
  const selectedPermissionSet = useMemo(() => new Set(selectedPermissionIds), [selectedPermissionIds]);

  const overrides = permissions.flatMap((permission) => {
    const base = basePermissionIds.has(permission.id);
    const selected = selectedPermissionSet.has(permission.id);
    if (base === selected) return [];
    return [{ permissionId: permission.id, effect: selected ? 'ALLOW' as const : 'DENY' as const, reason: 'Adjusted during staff provisioning' }];
  });

  function patch<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseRole(roleId: string) {
    patch('roleId', roleId);
    const role = assignableRoles.find((item) => item.id === roleId);
    setSelectedPermissionIds(role?.permissions?.map((permission) => permission.id) ?? []);
  }

  const canContinue = step === 1
    ? Boolean(form.firstName.trim() && form.lastName.trim() && form.email.trim())
    : step === 2
      ? Boolean(form.roleId)
      : step === 3
        ? Boolean(form.departmentId)
        : true;

  return (
    <Modal open onClose={onClose} title="Create staff account" className="staff-wizard-dialog">
      <div className="staff-wizard">
        <div className="staff-wizard-steps" aria-label="Staff creation progress">
          {['Profile', 'Role & access', 'Work structure', 'Review'].map((label, index) => (
            <button key={label} type="button" className={step === index + 1 ? 'is-active' : step > index + 1 ? 'is-complete' : ''} onClick={() => index + 1 < step && setStep(index + 1)}>
              <span>{index + 1}</span><strong>{label}</strong>
            </button>
          ))}
        </div>

        {step === 1 ? (
          <section className="staff-wizard-section">
            <div className="staff-wizard-heading"><span className="eyebrow">Step 1</span><h3>Who is joining PlanoraHub?</h3><p className="ui-help">Create the staff identity used across leads, tasks, chat and audit history.</p></div>
            <div className="polish-form-grid">
              <Input label="First name *" value={form.firstName} onChange={(event) => patch('firstName', event.target.value)} required />
              <Input label="Last name *" value={form.lastName} onChange={(event) => patch('lastName', event.target.value)} required />
              <Input label="Login email *" type="email" value={form.email} onChange={(event) => patch('email', event.target.value)} required />
              <Input label="Phone" value={form.phone} onChange={(event) => patch('phone', event.target.value)} />
              <Input label="Job title" value={form.jobTitle} onChange={(event) => patch('jobTitle', event.target.value)} />
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="staff-wizard-section">
            <div className="staff-wizard-heading"><span className="eyebrow">Step 2</span><h3>Choose a role, then review access</h3><p className="ui-help">Role permissions are inherited automatically. You can review and fine-tune this staff member&apos;s effective access before creating the account.</p></div>
            <div className="staff-role-choice-grid">
              {assignableRoles.map((role) => (
                <button key={role.id} type="button" className={`staff-role-choice ${form.roleId === role.id ? 'is-selected' : ''}`} onClick={() => chooseRole(role.id)}>
                  <div><strong>{role.name}</strong>{role.code === 'MARKETING' ? <Badge tone="info">Built in</Badge> : <Badge tone="neutral">Custom</Badge>}</div>
                  <span>{role.permissions?.length ?? 0} default permissions</span>
                </button>
              ))}
            </div>
            {selectedRole ? (
              <div className="staff-permission-review">
                <div className="staff-permission-review-head"><div><strong>Effective permissions</strong><p className="ui-help">Changes here apply only to {form.firstName || 'this staff member'} and do not alter the {selectedRole.name} role.</p></div><Badge tone={overrides.length ? 'warning' : 'success'}>{overrides.length ? `${overrides.length} custom` : 'Matches role'}</Badge></div>
                <PermissionChecklist
                  permissions={permissions}
                  selectedIds={selectedPermissionIds}
                  onToggle={(id, checked) => setSelectedPermissionIds((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))}
                />
              </div>
            ) : <p className="ui-help">Select a role to review its permissions.</p>}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="staff-wizard-section">
            <div className="staff-wizard-heading"><span className="eyebrow">Step 3</span><h3>Place them in the company structure</h3><p className="ui-help">A department is their permanent home. Teams are optional cross-functional groups they can work with.</p></div>
            <NativeSelect label="Department *" value={form.departmentId} onChange={(event) => patch('departmentId', event.target.value)} required>
              <option value="">Select department</option>
              {departments.filter((department) => department.is_active).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </NativeSelect>
            <div className="staff-team-review">
              <strong>Teams (optional)</strong>
              <p className="ui-help">Select any teams this staff member should join immediately.</p>
              <div className="team-option-list">
                {teams.filter((team) => team.is_active).map((team) => (
                  <label key={team.id} className="team-option-chip">
                    <input type="checkbox" checked={form.teamIds.includes(team.id)} onChange={(event) => patch('teamIds', event.target.checked ? [...form.teamIds, team.id] : form.teamIds.filter((id) => id !== team.id))} />
                    {team.name}
                  </label>
                ))}
                {!teams.some((team) => team.is_active) ? <span className="ui-help">No active teams yet. You can add them later.</span> : null}
              </div>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="staff-wizard-section">
            <div className="staff-wizard-heading"><span className="eyebrow">Step 4</span><h3>Review & send invitation</h3><p className="ui-help">The staff member will receive their CRM link, login email, temporary password, role and work structure by email.</p></div>
            <div className="staff-review-grid">
              <div><span>Name</span><strong>{form.firstName} {form.lastName}</strong></div>
              <div><span>Login email</span><strong>{form.email}</strong></div>
              <div><span>Role</span><strong>{selectedRole?.name || '—'}</strong></div>
              <div><span>Department</span><strong>{selectedDepartment?.name || '—'}</strong></div>
              <div><span>Teams</span><strong>{selectedTeams.map((team) => team.name).join(', ') || 'None'}</strong></div>
              <div><span>Permissions</span><strong>{selectedPermissionIds.length}{overrides.length ? ` (${overrides.length} customized)` : ''}</strong></div>
            </div>
            <div className="staff-invite-note"><strong>First-login protection is enabled</strong><span>They cannot access CRM data until they replace the temporary password.</span></div>
          </section>
        ) : null}

        {error ? <p className="task-form-error">{error}</p> : null}
        <div className="staff-wizard-actions">
          <Button type="button" variant="outline" onClick={() => step === 1 ? onClose() : setStep((current) => current - 1)}>{step === 1 ? 'Cancel' : 'Back'}</Button>
          {step < 4 ? (
            <Button type="button" disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>Continue</Button>
          ) : (
            <Button
              type="button"
              loading={saving}
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  const result = await createStaff({ ...form, permissionOverrides: overrides });
                  await onCreated({ name: `${form.firstName} ${form.lastName}`, email: form.email, password: result.temporaryPassword, emailDelivery: result.emailDelivery });
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'Unable to create staff.');
                  setSaving(false);
                }
              }}
            >
              Create staff & send invite
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
