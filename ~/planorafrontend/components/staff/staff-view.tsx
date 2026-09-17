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
import { PageErrorState } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  listPermissions,
  listRoles,
  listStaff,
  setStaffStatus,
  type MailDelivery,
  type Permission,
  type Role,
  type Staff,
} from '@/lib/staff/api';
import {
  createManagedDepartment,
  createManagedTeam,
  listManagedDepartments,
  listManagedTeamMembers,
  listManagedTeams,
  patchManagedDepartment,
  patchManagedTeam,
  updateManagedTeamMembers,
} from '@/lib/workspace/ops-api';
import { CreateStaffWizard } from './create-staff-wizard';
import { RoleManagement } from './role-management';
import { StructureOverviewModal } from './structure-overview-modal';

type Tab = 'STAFF' | 'ROLES' | 'DEPARTMENTS' | 'TEAMS';
type Department = {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  staff_count?: number;
  team_count?: number;
};
type Team = {
  id: string;
  name: string;
  description?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  manager_id?: string | null;
  manager_first_name?: string | null;
  manager_last_name?: string | null;
  member_count?: number;
  is_active: boolean;
};

export function StaffView() {
  const [tab, setTab] = useState<Tab>('STAFF');
  const [rows, setRows] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [query, setQuery] = useState('');
  const [openStaff, setOpenStaff] = useState(false);
  const [structure, setStructure] = useState<'DEPARTMENT' | 'TEAM' | null>(null);
  const [structureOverview, setStructureOverview] = useState<
    | { kind: 'DEPARTMENT'; id: string; name: string; is_active: boolean }
    | { kind: 'TEAM'; id: string; name: string; is_active: boolean; manager_id?: string | null }
    | null
  >(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string; emailDelivery: MailDelivery } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [staff, roleRows, permissionRows, departmentRows, teamRows] = await Promise.all([
        listStaff(),
        listRoles(),
        listPermissions(),
        listManagedDepartments(),
        listManagedTeams(),
      ]);
      setRows(staff);
      setRoles(roleRows);
      setPermissions(permissionRows);
      setDepartments(departmentRows as Department[]);
      setTeams(teamRows as Team[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load staff operations.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    if (window.location.hash === '#roles') setTab('ROLES');
    else if (window.location.hash === '#departments') setTab('DEPARTMENTS');
    else if (window.location.hash === '#teams') setTab('TEAMS');
    else if (window.location.hash === '#staff') setTab('STAFF');
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((staff) =>
      [
        staff.first_name,
        staff.last_name,
        staff.email,
        staff.job_title,
        staff.role_name,
        staff.department_name,
        (staff as Staff & { team_names?: string }).team_names,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, query]);

  const activeDepartments = departments.filter((department) => department.is_active);
  const activeStaff = rows.filter((staff) => staff.status === 'ACTIVE');
  const invitedStaff = rows.filter((staff) => staff.status === 'INVITED');
  const activeTeams = teams.filter((team) => team.is_active);
  const activeRoles = roles.filter((role) => role.code !== 'SUPER_ADMIN' && role.is_active !== false && (['MARKETING', 'FINANCE'].includes(role.code) || !role.is_system_role));


  return (
    <AppShell
      area="admin"
      title="Staff & Access"
      breadcrumb="People"
      description="Manage people, access, departments, teams and staff invitations from one workforce workspace."
      actions={
        <Button onClick={() => setOpenStaff(true)} disabled={!activeDepartments.length || !activeRoles.length}>+ Add Staff</Button>
      }
    >
      {loading ? <Skeleton height={480} /> : error ? <PageErrorState message={error} /> : (
        <div className="page-stack staff-page staff-page--p20">
          <section className="staff-control-hero">
            <div className="staff-control-copy">
              <span className="eyebrow">Workforce control center</span>
              <h2>Build the team in the right order.</h2>
              <p>
                Define access once, organize the company, then invite staff with the correct role, department, teams and first-login security already attached.
              </p>
            </div>
            <div className="staff-control-actions" aria-label="Staff quick actions">
              <Button variant="outline" onClick={() => setTab('ROLES')}>Manage roles</Button>
              <Button variant="outline" onClick={() => { setTab('DEPARTMENTS'); setStructure('DEPARTMENT'); }}>+ Department</Button>
              <Button variant="outline" onClick={() => { setTab('TEAMS'); setStructure('TEAM'); }}>+ Team</Button>
            </div>
          </section>

          <section className="staff-setup-flow" aria-label="Workforce setup flow">
            <button type="button" className={tab === 'ROLES' ? 'is-active' : ''} onClick={() => setTab('ROLES')}>
              <span className="staff-setup-step">01</span>
              <span><strong>Roles & access</strong><small>{activeRoles.length} active role{activeRoles.length === 1 ? '' : 's'}</small></span>
              <b>Define permissions</b>
            </button>
            <button type="button" className={tab === 'DEPARTMENTS' ? 'is-active' : ''} onClick={() => setTab('DEPARTMENTS')}>
              <span className="staff-setup-step">02</span>
              <span><strong>Departments</strong><small>{activeDepartments.length} active</small></span>
              <b>Organize people</b>
            </button>
            <button type="button" className={tab === 'TEAMS' ? 'is-active' : ''} onClick={() => setTab('TEAMS')}>
              <span className="staff-setup-step">03</span>
              <span><strong>Teams</strong><small>{activeTeams.length} active</small></span>
              <b>Group work</b>
            </button>
            <button type="button" className={tab === 'STAFF' ? 'is-active' : ''} onClick={() => setTab('STAFF')}>
              <span className="staff-setup-step">04</span>
              <span><strong>Staff</strong><small>{activeStaff.length} active · {invitedStaff.length} invited</small></span>
              <b>Invite people</b>
            </button>
          </section>

          <section className="staff-workspace-card staff-workspace-card--direct">
            <div className="staff-workspace-body">
              {tab === 'STAFF' ? (
                <StaffDirectory
                  rows={visible}
                  allRows={rows}
                  query={query}
                  setQuery={setQuery}
                  departments={departments}
                  created={created}
                  onCreateDepartment={() => {
                    setTab('DEPARTMENTS');
                    setStructure('DEPARTMENT');
                  }}
                  onReload={load}
                />
              ) : tab === 'ROLES' ? (
                <RoleManagement roles={roles} permissions={permissions} onReload={load} />
              ) : tab === 'DEPARTMENTS' ? (
                <DepartmentView departments={departments} staff={rows} onReload={load} onOpenOverview={(department) => setStructureOverview({ kind: 'DEPARTMENT', id: department.id, name: department.name, is_active: department.is_active })} />
              ) : (
                <TeamView teams={teams} staff={rows} departments={departments} onReload={load} onOpenOverview={(team) => setStructureOverview({ kind: 'TEAM', id: team.id, name: team.name, is_active: team.is_active, manager_id: team.manager_id })} />
              )}
            </div>
          </section>
        </div>
      )}

      {openStaff ? (
        <CreateStaffWizard
          roles={roles}
          permissions={permissions}
          departments={departments}
          teams={teams}
          staff={rows}
          onClose={() => setOpenStaff(false)}
          onCreated={async (result) => {
            setCreated(result);
            setOpenStaff(false);
            setTab('STAFF');
            await load();
          }}
        />
      ) : null}

      {structure ? (
        <StructureModal
          mode={structure}
          departments={departments}
          staff={rows}
          close={() => setStructure(null)}
          saved={async () => {
            setStructure(null);
            await load();
          }}
        />
      ) : null}

      {structureOverview ? (
        <StructureOverviewModal
          target={structureOverview}
          departments={departments}
          teams={teams}
          onClose={() => setStructureOverview(null)}
          onChanged={load}
        />
      ) : null}
    </AppShell>
  );
}

function StaffDirectory({
  rows,
  allRows,
  query,
  setQuery,
  departments,
  created,
  onCreateDepartment,
  onReload,
}: {
  rows: Staff[];
  allRows: Staff[];
  query: string;
  setQuery: (value: string) => void;
  departments: Department[];
  created: { name: string; email: string; password: string; emailDelivery: MailDelivery } | null;
  onCreateDepartment: () => void;
  onReload: () => Promise<void>;
}) {
  const [status, setStatus] = useState<'ALL' | Staff['status']>('ALL');
  const filteredRows = status === 'ALL' ? rows : rows.filter((staff) => staff.status === status);
  const statusCounts = {
    ALL: allRows.length,
    ACTIVE: allRows.filter((staff) => staff.status === 'ACTIVE').length,
    INVITED: allRows.filter((staff) => staff.status === 'INVITED').length,
    SUSPENDED: allRows.filter((staff) => staff.status === 'SUSPENDED').length,
  };

  if (!departments.some((department) => department.is_active)) {
    return (
      <Card>
        <div className="ui-card-content staff-empty-action">
          <span className="eyebrow">Setup required</span>
          <h2>Create a department first</h2>
          <p className="ui-help">Every staff member must belong to an active department before their account can be created.</p>
          <div><Button onClick={onCreateDepartment}>Create first department</Button></div>
        </div>
      </Card>
    );
  }

  return (
    <div className="staff-directory">
      {created ? (
        <div className="staff-created-banner">
          <div>
            <span className="staff-created-check">✓</span>
            <div>
              <strong>{created.name} is ready to sign in.</strong>
              <p>{created.email} · temporary password is shown once below.</p>
              <small className={`credential-delivery credential-delivery--${created.emailDelivery.status.toLowerCase()}`}>{created.emailDelivery.message}</small>
            </div>
          </div>
          <div className="temporary-password-line">
            <code>{created.password}</code>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(created.password)}>Copy password</Button>
          </div>
        </div>
      ) : null}

      <div className="staff-directory-heading">
        <div>
          <span className="eyebrow">People directory</span>
          <h2>Staff members</h2>
          <p className="ui-help">Search the workforce, review access placement and open a person’s profile for deeper account controls.</p>
        </div>
        <div className="staff-directory-count"><strong>{allRows.length}</strong><span>Total staff</span></div>
      </div>

      <div className="staff-directory-toolbar staff-directory-toolbar--p20">
        <Input
          aria-label="Search staff"
          placeholder="Search name, email, role, department or team…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="staff-status-filters" aria-label="Filter staff by status">
          {(['ALL', 'ACTIVE', 'INVITED', 'SUSPENDED'] as const).map((value) => (
            <button key={value} type="button" className={status === value ? 'is-active' : ''} onClick={() => setStatus(value)}>
              {value === 'ALL' ? 'All' : value[0] + value.slice(1).toLowerCase()} <span>{statusCounts[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <Card className="staff-table-card staff-table-card--p20">
        <div className="table-wrap staff-table-wrap">
          <table className="ui-table staff-directory-table">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Role & work</th>
                <th>Department</th>
                <th>Teams</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((staff) => {
                const teams = ((staff as Staff & { team_names?: string }).team_names || '').split(',').map((item) => item.trim()).filter(Boolean);
                return (
                  <tr key={staff.id}>
                    <td>
                      <div className="staff-person-cell">
                        <span className="staff-person-avatar" aria-hidden="true">{staff.first_name[0]}{staff.last_name[0]}</span>
                        <div>
                          <Link href={`/staff/${staff.id}`} className="staff-name-link"><strong>{staff.first_name} {staff.last_name}</strong></Link>
                          <div className="ui-help">{staff.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><strong className="staff-table-primary">{staff.role_name || staff.role_code}</strong><span className="staff-table-secondary">{staff.job_title || 'No job title'}</span></td>
                    <td>{staff.department_name || <span className="ui-help">Not assigned</span>}</td>
                    <td><div className="staff-team-chips">{teams.length ? teams.slice(0, 2).map((team) => <span key={team}>{team}</span>) : <span className="staff-team-empty">None</span>}{teams.length > 2 ? <span>+{teams.length - 2}</span> : null}</div></td>
                    <td><StaffStatus status={staff.status} /></td>
                    <td>
                      <div className="staff-row-actions">
                        <Link href={`/staff/${staff.id}`}><Button size="sm" variant="outline">View profile</Button></Link>
                        <StatusAction staff={staff} onReload={onReload} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="staff-mobile-list staff-mobile-list--p20">
        {filteredRows.map((staff) => {
          const teams = ((staff as Staff & { team_names?: string }).team_names || '').split(',').map((item) => item.trim()).filter(Boolean);
          return (
            <Card key={staff.id}>
              <div className="staff-mobile-card">
                <div className="staff-mobile-card-head">
                  <div className="staff-person-cell">
                    <span className="staff-person-avatar" aria-hidden="true">{staff.first_name[0]}{staff.last_name[0]}</span>
                    <div>
                      <Link href={`/staff/${staff.id}`} className="staff-name-link"><strong>{staff.first_name} {staff.last_name}</strong></Link>
                      <div className="ui-help">{staff.email}</div>
                    </div>
                  </div>
                  <StaffStatus status={staff.status} />
                </div>
                <div className="staff-mobile-card-meta">
                  <div><span>Role</span>{staff.role_name || staff.role_code}</div>
                  <div><span>Job title</span>{staff.job_title || '—'}</div>
                  <div><span>Department</span>{staff.department_name || '—'}</div>
                  <div><span>Teams</span>{teams.join(', ') || 'None'}</div>
                </div>
                <div className="staff-mobile-card-actions">
                  <Link href={`/staff/${staff.id}`}><Button size="sm" variant="outline">View profile</Button></Link>
                  <StatusAction staff={staff} onReload={onReload} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {!filteredRows.length ? (
        <Card><div className="empty-state"><div><strong>No staff found.</strong><p className="ui-help">Try another search or status filter.</p></div></div></Card>
      ) : null}
    </div>
  );
}

function StaffStatus({ status }: { status: Staff['status'] }) {
  return <Badge tone={status === 'ACTIVE' ? 'success' : status === 'INVITED' ? 'warning' : 'danger'}>{status}</Badge>;
}

function StatusAction({ staff, onReload }: { staff: Staff; onReload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const action = staff.status === 'ACTIVE' ? 'suspend' : 'reactivate';
  return (
    <Button
      size="sm"
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setStaffStatus(staff.id, action);
          await onReload();
        } finally {
          setBusy(false);
        }
      }}
    >
      {action === 'suspend' ? 'Suspend' : 'Reactivate'}
    </Button>
  );
}

function DepartmentView({
  departments,
  staff,
  onReload,
  onOpenOverview,
}: {
  departments: Department[];
  staff: Staff[];
  onReload: () => Promise<void>;
  onOpenOverview: (department: Department) => void;
}) {
  const [editing, setEditing] = useState<Department | null>(null);

  return (
    <>
      <div className="structure-grid staff-structure-grid">
        {departments.map((department) => {
          const departmentStaff = staff.filter((member) => member.department_id === department.id);
          return (
            <Card key={department.id}>
              <div className="ui-card-content structure-card">
                <div className="structure-card-head">
                  <div>
                    <span className="eyebrow">Department</span>
                    <h2>{department.name}</h2>
                  </div>
                  <Badge tone={department.is_active ? 'success' : 'neutral'}>{department.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="ui-help structure-description">{department.description || 'No description yet.'}</p>
                <div className="structure-stats">
                  <span><strong>{departmentStaff.length}</strong> staff</span>
                  <span><strong>{department.team_count ?? 0}</strong> teams</span>
                </div>
                <div className="structure-member-preview">
                  {departmentStaff.slice(0, 4).map((member) => (
                    <div key={member.id}>
                      <span>{member.first_name} {member.last_name}</span>
                      <small>{member.job_title || member.role_name}</small>
                    </div>
                  ))}
                  {departmentStaff.length > 4 ? <small className="ui-help">+ {departmentStaff.length - 4} more staff</small> : null}
                </div>
                <div className="structure-card-actions">
                  <Button size="sm" onClick={() => onOpenOverview(department)}>View details</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(department)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await patchManagedDepartment(department.id, { isActive: !department.is_active });
                      await onReload();
                    }}
                  >
                    {department.is_active ? 'Suspend' : 'Reactivate'}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {!departments.length ? <Card><div className="empty-state"><strong>No departments yet.</strong></div></Card> : null}
      {editing ? <EditDepartment department={editing} close={() => setEditing(null)} saved={async () => { setEditing(null); await onReload(); }} /> : null}
    </>
  );
}

function TeamView({
  teams,
  staff,
  departments,
  onReload,
  onOpenOverview,
}: {
  teams: Team[];
  staff: Staff[];
  departments: Department[];
  onReload: () => Promise<void>;
  onOpenOverview: (team: Team) => void;
}) {
  const [membersTeam, setMembersTeam] = useState<Team | null>(null);
  const [editing, setEditing] = useState<Team | null>(null);

  return (
    <>
      <div className="structure-grid staff-structure-grid">
        {teams.map((team) => (
          <Card key={team.id}>
            <div className="ui-card-content structure-card">
              <div className="structure-card-head">
                <div>
                  <span className="eyebrow">{team.department_name || 'Cross-department team'}</span>
                  <h2>{team.name}</h2>
                </div>
                <Badge tone={team.is_active ? 'success' : 'neutral'}>{team.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="ui-help structure-description">{team.description || 'No description yet.'}</p>
              <div className="structure-stats">
                <span><strong>{team.member_count || 0}</strong> members</span>
                <span>Lead: <strong>{team.manager_first_name ? `${team.manager_first_name} ${team.manager_last_name}` : 'Not assigned'}</strong></span>
              </div>
              <div className="structure-card-actions">
                <Button size="sm" onClick={() => onOpenOverview(team)}>View details</Button>
                <Button size="sm" variant="outline" onClick={() => setMembersTeam(team)}>Members</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(team)}>Edit</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await patchManagedTeam(team.id, { isActive: !team.is_active, managerId: team.manager_id || null });
                    await onReload();
                  }}
                >
                  {team.is_active ? 'Suspend' : 'Reactivate'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {!teams.length ? <Card><div className="empty-state"><strong>No teams yet.</strong></div></Card> : null}
      {membersTeam ? <TeamMembers team={membersTeam} staff={staff} close={async () => { setMembersTeam(null); await onReload(); }} /> : null}
      {editing ? <EditTeam team={editing} departments={departments} staff={staff} close={() => setEditing(null)} saved={async () => { setEditing(null); await onReload(); }} /> : null}
    </>
  );
}

function TeamMembers({ team, staff, close }: { team: Team; staff: Staff[]; close: () => void | Promise<void> }) {
  const [ids, setIds] = useState<string[]>([]);
  const [lead, setLead] = useState(team.manager_id || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listManagedTeamMembers(team.id).then((members) => setIds(members.map((row: { id: string }) => row.id)));
  }, [team.id]);

  return (
    <Modal open onClose={() => void close()} title={`Manage ${team.name}`}>
      <div className="stack">
        <NativeSelect label="Team lead" value={lead} onChange={(event) => setLead(event.target.value)}>
          <option value="">No team lead</option>
          {staff.filter((member) => member.status === 'ACTIVE').map((member) => (
            <option key={member.id} value={member.id}>{member.first_name} {member.last_name} · {member.department_name || 'No department'}</option>
          ))}
        </NativeSelect>
        <div>
          <strong>Members</strong>
          <p className="ui-help">Teams can contain staff from different departments.</p>
          <div className="team-member-list">
            {staff.filter((member) => member.status === 'ACTIVE').map((member) => (
              <label key={member.id} className="team-member-option">
                <input
                  type="checkbox"
                  checked={ids.includes(member.id)}
                  onChange={(event) => setIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))}
                />
                <span>{member.first_name} {member.last_name}<small className="ui-help">{member.department_name || 'No department'} · {member.job_title || member.role_name}</small></span>
              </label>
            ))}
          </div>
        </div>
        <div className="polish-actions">
          <Button variant="outline" onClick={() => void close()}>Cancel</Button>
          <Button loading={saving} onClick={async () => {
            setSaving(true);
            try {
              await updateManagedTeamMembers(team.id, { memberIds: ids, managerId: lead || null });
              await close();
            } finally {
              setSaving(false);
            }
          }}>Save team</Button>
        </div>
      </div>
    </Modal>
  );
}

function StructureModal({
  mode,
  departments,
  staff,
  close,
  saved,
}: {
  mode: 'DEPARTMENT' | 'TEAM';
  departments: Department[];
  staff: Staff[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal open onClose={close} title={mode === 'DEPARTMENT' ? 'New department' : 'New team'}>
      <form className="stack" onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          if (mode === 'DEPARTMENT') await createManagedDepartment({ name, description });
          else await createManagedTeam({ name, description, departmentId: departmentId || null, managerId: managerId || null });
          await saved();
        } finally {
          setSaving(false);
        }
      }}>
        <Input label="Name *" value={name} onChange={(event) => setName(event.target.value)} required />
        <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        {mode === 'TEAM' ? (
          <div className="polish-form-grid">
            <NativeSelect label="Home department (optional)" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">Cross-department team</option>
              {departments.filter((department) => department.is_active).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </NativeSelect>
            <NativeSelect label="Team lead" value={managerId} onChange={(event) => setManagerId(event.target.value)}>
              <option value="">Assign later</option>
              {staff.filter((member) => member.status === 'ACTIVE').map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
            </NativeSelect>
          </div>
        ) : null}
        <div className="polish-actions">
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="submit" loading={saving}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditDepartment({ department, close, saved }: { department: Department; close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description || '');
  const [saving, setSaving] = useState(false);
  return (
    <Modal open onClose={close} title={`Edit ${department.name}`}>
      <form className="stack" onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await patchManagedDepartment(department.id, { name, description, isActive: department.is_active });
          await saved();
        } finally { setSaving(false); }
      }}>
        <Input label="Department name *" value={name} onChange={(event) => setName(event.target.value)} required />
        <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
        <div className="polish-actions"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div>
      </form>
    </Modal>
  );
}

function EditTeam({ team, departments, staff, close, saved }: { team: Team; departments: Department[]; staff: Staff[]; close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || '');
  const [managerId, setManagerId] = useState(team.manager_id || '');
  const [saving, setSaving] = useState(false);
  return (
    <Modal open onClose={close} title={`Edit ${team.name}`}>
      <form className="stack" onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await patchManagedTeam(team.id, { name, description, managerId: managerId || null, isActive: team.is_active });
          await saved();
        } finally { setSaving(false); }
      }}>
        <Input label="Team name *" value={name} onChange={(event) => setName(event.target.value)} required />
        <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
        <NativeSelect label="Team lead" value={managerId} onChange={(event) => setManagerId(event.target.value)}>
          <option value="">No team lead</option>
          {staff.filter((member) => member.status === 'ACTIVE').map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name} · {member.department_name || 'No department'}</option>)}
        </NativeSelect>
        {team.department_id ? <p className="ui-help">Home department: {departments.find((department) => department.id === team.department_id)?.name || team.department_name || 'Unknown'}</p> : <p className="ui-help">This is a cross-department team.</p>}
        <div className="polish-actions"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div>
      </form>
    </Modal>
  );
}
