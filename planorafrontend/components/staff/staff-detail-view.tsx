'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { NativeSelect } from '@/components/ui/native-select';
import {
  deleteStaff,
  getStaff,
  listDepartments,
  listRoles,
  listStaff,
  listTeams,
  resetStaffPassword,
  setStaffStatus,
  updateStaff,
  type Department,
  type MailDelivery,
  type Role,
  type Staff,
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

const connectionMeta = [
  { key: 'leads', label: 'Assigned Leads', icon: '◎', href: '/leads' },
  { key: 'prospects', label: 'Prospects', icon: '↗', href: '/prospects' },
  { key: 'clients', label: 'Clients', icon: '▣', href: '/clients' },
  { key: 'tasks', label: 'Tasks', icon: '☷', href: '/tasks' },
  { key: 'followups', label: 'Follow-ups', icon: '◷', href: '/follow-ups' },
  { key: 'mail_threads', label: 'Mail threads', icon: '✉', href: '/email' },
  { key: 'letters', label: 'Official letters', icon: '▤', href: '/letterhead' },
  { key: 'shared_files', label: 'Shared files', icon: '▱', href: '/shared-files' },
] as const;

export function StaffDetailView({ staffId }: { staffId: string }) {
  const router = useRouter();
  const [item, setItem] = useState<StaffProfile | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [passwordDelivery, setPasswordDelivery] = useState<MailDelivery | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; department_id: string }>>([]);
  const [staffOptions, setStaffOptions] = useState<Staff[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setItem(await getStaff(staffId));
  }

  useEffect(() => {
    let active = true;
    Promise.all([getStaff(staffId), listRoles(), listDepartments(), listTeams(), listStaff()]).then(
      ([profile, roleRows, departmentRows, teamRows, staffRows]) => {
        if (!active) return;
        setItem(profile);
        setRoles(roleRows);
        setDepartments(departmentRows);
        setTeams(teamRows);
        setStaffOptions(staffRows);
      },
    );
    return () => { active = false; };
  }, [staffId]);

  if (!item) {
    return <AppShell area="admin" title="Staff" breadcrumb="People / Staff"><Card><div className="ui-card-content">Loading staff profile…</div></Card></AppShell>;
  }

  const name = `${item.first_name} ${item.last_name}`;
  const connections = item.connections ?? {};
  const connectedTotal = connectionMeta.reduce((sum, entry) => sum + Number(connections[entry.key] || 0), 0);

  async function action(kind: 'suspend' | 'disable' | 'reactivate') {
    setBusy(true);setMessage(null);
    try {
      await setStaffStatus(staffId, kind);
      await load();
      setMessage(kind === 'reactivate' ? 'Staff access is active.' : `Staff account ${kind}d.`);
    } finally { setBusy(false); }
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
      breadcrumb="People / Staff"
      description={`${item.job_title || item.role_name} · ${item.department_name || 'No department'}`}
      actions={<Link href="/staff"><Button variant="outline">← Staff directory</Button></Link>}
    >
      <div className="staff-profile-page-v2">
        <Card className="staff-profile-hero-v2">
          <div className="ui-card-content">
            <div className="staff-profile-hero-v2__top">
              <div className="staff-profile-identity-v2">
                <div className="staff-profile-avatar-v2">{item.first_name?.[0]}{item.last_name?.[0]}</div>
                <div>
                  <div className="staff-profile-name-line"><h1>{name}</h1><Badge tone={item.status === 'ACTIVE' ? 'success' : item.status === 'INVITED' ? 'warning' : 'danger'}>{item.status}</Badge></div>
                  <p>{item.job_title || item.role_name}</p>
                  <a href={`mailto:${item.email}`}>{item.email}</a>
                </div>
              </div>
              <div className="staff-profile-hero-v2__actions"><Button variant="outline" onClick={() => setEditOpen(true)}>Edit profile</Button></div>
            </div>

            <div className="staff-profile-facts-v2">
              <div><span>Role</span><strong>{item.role_name || 'Unassigned'}</strong><small>{item.role_code || 'No role code'}</small></div>
              <div><span>Department</span><strong>{item.department_name || 'Unassigned'}</strong><small>Primary work home</small></div>
              <div><span>Teams</span><strong>{item.teams?.length || 0}</strong><small>{item.teams?.map((x:any)=>x.name).join(', ') || 'No team memberships'}</small></div>
              <div><span>Last login</span><strong>{item.last_login_at ? new Date(item.last_login_at).toLocaleDateString() : 'Not yet'}</strong><small>{item.last_login_at ? new Date(item.last_login_at).toLocaleTimeString() : 'Waiting for first sign-in'}</small></div>
            </div>
          </div>
        </Card>

        <div className="staff-profile-grid-v2">
          <Card>
            <div className="ui-card-content staff-workspace-card-v2">
              <div className="staff-card-heading-v2"><div><span className="eyebrow">Workspace connections</span><h2>Where this staff member is connected</h2><p>Live CRM relationships and work currently associated with this account.</p></div><Badge tone={connectedTotal ? 'info' : 'neutral'}>{connectedTotal} linked</Badge></div>
              <div className="staff-connections-grid-v2">
                {connectionMeta.map((entry) => <Link href={entry.href} className={Number(connections[entry.key] || 0) ? 'staff-connection-v2 has-items' : 'staff-connection-v2'} key={entry.key} aria-label={`Open ${entry.label}`}><span className="staff-connection-v2__icon">{entry.icon}</span><span><strong>{Number(connections[entry.key] || 0)}</strong><small>{entry.label}</small></span><span className="staff-connection-v2__arrow" aria-hidden="true">→</span></Link>)}
              </div>
              <div className="staff-memberships-v2">
                <strong>Team memberships</strong>
                <div>{item.teams?.length ? item.teams.map((team:any)=><span key={team.id}>{team.name}{team.department_name ? ` · ${team.department_name}` : ''}</span>) : <small>No team memberships yet.</small>}</div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="ui-card-content staff-access-card-v2">
              <span className="eyebrow">Account controls</span>
              <h2>Access & security</h2>
              <div className="staff-access-state-v2"><div><span>Account state</span><strong>{item.status === 'INVITED' ? 'Invitation pending' : item.status === 'ACTIVE' ? 'Active workspace access' : humanStatus(item.status)}</strong></div><div><span>Password</span><strong>{item.must_change_password ? 'Change required' : 'Protected'}</strong></div></div>
              <p className="ui-help">Temporary-password accounts remain invited until the staff member sets their own password. Activated accounts can also be permanently removed when Admin intentionally confirms deletion; linked work must be reassigned first.</p>
              <div className="staff-security-actions-v2">
                <Button variant="outline" disabled={busy} onClick={() => setResetOpen(true)}>{item.status === 'INVITED' ? 'Issue new temporary password' : 'Reset password'}</Button>
                {item.status === 'ACTIVE' ? <><Button variant="outline" disabled={busy} onClick={() => void action('suspend')}>Suspend</Button><Button variant="outline" disabled={busy} onClick={() => void action('disable')}>Disable</Button></> : item.status === 'SUSPENDED' || item.status === 'DISABLED' ? <Button disabled={busy} onClick={() => void action('reactivate')}>Reactivate</Button> : null}
              </div>
              <div className="staff-delete-invite-v2"><div><strong>Permanent account deletion</strong><span>{connectedTotal ? `${connectedTotal} linked workspace record${connectedTotal === 1 ? '' : 's'} will need an ownership handoff before this account is removed.` : 'This account currently has no linked workspace records.'}</span></div><Button variant="outline" onClick={() => setDeleteOpen(true)}>Delete staff account</Button></div>

              {password ? <div className="temporary-password-box"><strong>Temporary password</strong><div className="temporary-password-line"><code>{password}</code><Button size="sm" variant="outline" onClick={() => void copyPassword()}>Copy</Button></div><small>This value is shown only for this admin session. The staff member must change it before accessing CRM data.</small>{passwordDelivery ? <small className={`credential-delivery credential-delivery--${passwordDelivery.status.toLowerCase()}`}>{passwordDelivery.message}</small> : null}</div> : null}
              {message ? <p className="staff-inline-message-v2">{message}</p> : null}
            </div>
          </Card>
        </div>

        <Card>
          <div className="ui-card-content">
            <div className="staff-card-heading-v2"><div><span className="eyebrow">System log</span><h2>Activity & account history</h2><p>Security events and administrative changes connected to this staff account.</p></div></div>
            <div className="staff-history-v2">
              {item.audit_events?.length ? item.audit_events.slice(0, 30).map((event:any)=><div className="staff-history-row-v2" key={event.id}><span className="staff-history-dot-v2"/><div><strong>{humanStatus(String(event.action))}</strong><small>{event.module ? humanStatus(String(event.module)) : 'System'}</small></div><time>{new Date(event.created_at).toLocaleString()}</time></div>) : <div className="staff-history-empty-v2">No activity recorded yet.</div>}
            </div>
          </div>
        </Card>
      </div>

      {resetOpen ? <ResetPasswordDialog staffName={name} staffEmail={item.email} onClose={() => setResetOpen(false)} onReset={async(sendEmail)=>{const result=await resetStaffPassword(staffId,{sendEmail});setPassword(result.temporaryPassword);setPasswordDelivery(result.emailDelivery);setResetOpen(false);setMessage('A new temporary password has been issued.');await load();}}/> : null}

      {deleteOpen ? <DeleteStaffDialog staffName={name} staffEmail={item.email} status={item.status} connectedTotal={connectedTotal} staffOptions={staffOptions.filter((staff)=>staff.id!==staffId&&staff.status==='ACTIVE')} onClose={()=>setDeleteOpen(false)} onDelete={async(reassignToId)=>{await deleteStaff(staffId,reassignToId);router.push('/staff');router.refresh();}}/> : null}

      {editOpen ? <EditStaffDialog item={item} roles={roles} departments={departments} teams={teams} onClose={() => setEditOpen(false)} onSaved={async()=>{setEditOpen(false);await load();setMessage('Staff profile updated.');}}/> : null}
    </AppShell>
  );
}

function DeleteStaffDialog({staffName,staffEmail,status,connectedTotal,staffOptions,onClose,onDelete}:{staffName:string;staffEmail:string;status:string;connectedTotal:number;staffOptions:Staff[];onClose:()=>void;onDelete:(reassignToId:string|null)=>Promise<void>}){
  const[confirm,setConfirm]=useState('');
  const[reassignToId,setReassignToId]=useState('');
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const needsReassignment=connectedTotal>0;
  const disabled=confirm!=='DELETE'||(needsReassignment&&!reassignToId);
  return <Modal open onClose={onClose} title="Delete staff account"><div className="stack delete-invited-dialog-v2"><div className="staff-delete-warning-v2"><strong>This permanently removes {staffName}'s CRM account.</strong><span>{staffName} ({staffEmail}) is currently {humanStatus(status)}. {needsReassignment?`${connectedTotal} linked workspace record${connectedTotal===1?'':'s'} must be handed to another active staff member before deletion.`:'There is no linked workspace work to transfer.'} This action cannot be undone.</span></div><NativeSelect label={needsReassignment?'Reassign linked work to *':'Reassign linked work to (optional)'} value={reassignToId} onChange={(event)=>setReassignToId(event.target.value)} required={needsReassignment}><option value="">{needsReassignment?'Select active staff':'No reassignment'}</option>{staffOptions.map((staff)=><option key={staff.id} value={staff.id}>{staff.first_name} {staff.last_name} · {staff.role_name}</option>)}</NativeSelect>{needsReassignment&&staffOptions.length===0?<p className="task-form-error">There is no other active staff account available for reassignment. Reactivate or create a staff account first.</p>:null}<Input label="Type DELETE to confirm" value={confirm} onChange={(event)=>setConfirm(event.target.value)} autoComplete="off"/>{error?<p className="task-form-error">{error}</p>:null}<div className="polish-actions"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={disabled||saving||Boolean(needsReassignment&&staffOptions.length===0)} loading={saving} onClick={async()=>{setSaving(true);setError(null);try{await onDelete(reassignToId||null)}catch(caught){setError(caught instanceof Error?caught.message:'Unable to delete staff account.');setSaving(false)}}}>Delete account</Button></div></div></Modal>;
}

function humanStatus(value:string){return value.replaceAll('_',' ').replaceAll('-',' ').toLowerCase().replace(/\b\w/g,(char)=>char.toUpperCase())}

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
