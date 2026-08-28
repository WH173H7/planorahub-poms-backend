'use client';

import {
  Building2,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { apiFetch } from '@/lib/api';

type Role = {
  id: string;
  code: string;
  name: string;
};

type Department = {
  id: string;
  name: string;
  description: string | null;

  staff_count: number;
  team_count: number;
  roles: Role[];
};

type Team = {
  id: string;

  name: string;
  description: string | null;

  department_id: string;
  department_name: string;

  manager_id: string | null;
  manager_name: string | null;

  member_count: number;
};

type Staff = {
  id: string;

  first_name: string;
  last_name: string;

  email: string;

  status: string;
};

type Response<T> = {
  success: boolean;
  data: T;
};

export default function SettingsPage() {
  const [
    departments,
    setDepartments,
  ] = useState<Department[]>([]);

  const [teams, setTeams] =
    useState<Team[]>([]);

  const [roles, setRoles] =
    useState<Role[]>([]);

  const [staff, setStaff] =
    useState<Staff[]>([]);

  const [
    activeSection,
    setActiveSection,
  ] = useState<
    'departments' | 'teams'
  >('departments');

  const [
    showDepartmentForm,
    setShowDepartmentForm,
  ] = useState(false);

  const [
    showTeamForm,
    setShowTeamForm,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [
        departmentResponse,
        teamResponse,
        roleResponse,
        staffResponse,
      ] = await Promise.all([
        apiFetch<
          Response<Department[]>
        >('/admin/departments'),

        apiFetch<Response<Team[]>>(
          '/admin/teams',
        ),

        apiFetch<Response<Role[]>>(
          '/admin/roles',
        ),

        apiFetch<Response<Staff[]>>(
          '/admin/staff',
        ),
      ]);

      setDepartments(
        departmentResponse.data,
      );

      setTeams(teamResponse.data);
      setRoles(roleResponse.data);

      setStaff(staffResponse.data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to load settings.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-8">
        <p className="text-sm font-medium text-[#7a6f7b]">
          Administration
        </p>

        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Settings
        </h1>

        <p className="mt-2 text-sm text-[#726874]">
          Configure your organisation
          structure and staff teams.
        </p>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <aside className="h-fit rounded-xl border border-[#e9e2ea] bg-white p-2">
          <button
            type="button"
            onClick={() =>
              setActiveSection(
                'departments',
              )
            }
            className={[
              'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold',
              activeSection ===
              'departments'
                ? 'bg-[#f4eff6] text-[#36133b]'
                : 'text-[#675f68]',
            ].join(' ')}
          >
            <Building2 size={17} />

            Departments
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveSection('teams')
            }
            className={[
              'mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold',
              activeSection === 'teams'
                ? 'bg-[#f4eff6] text-[#36133b]'
                : 'text-[#675f68]',
            ].join(' ')}
          >
            <Users size={17} />

            Teams
          </button>
        </aside>

        <section className="rounded-xl border border-[#e9e2ea] bg-white">
          {activeSection ===
          'departments' ? (
            <>
              <div className="flex items-center justify-between border-b border-[#eee8ef] p-5">
                <div>
                  <h2 className="font-semibold">
                    Departments
                  </h2>

                  <p className="mt-1 text-sm text-[#726874]">
                    Define major Planorahub
                    business units.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowDepartmentForm(
                      true,
                    )
                  }
                  className="flex items-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Plus size={16} />
                  Add Department
                </button>
              </div>

              <div className="divide-y divide-[#eee8ef]">
                {loading ? (
                  <div className="p-8 text-sm text-[#817681]">
                    Loading departments...
                  </div>
                ) : departments.length ===
                  0 ? (
                  <EmptyState
                    title="No departments"
                    text="Create your first company department."
                  />
                ) : (
                  departments.map(
                    (department) => (
                      <DepartmentRow
                        key={
                          department.id
                        }
                        department={
                          department
                        }
                        roles={roles}
                        onRefresh={load}
                      />
                    ),
                  )
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-[#eee8ef] p-5">
                <div>
                  <h2 className="font-semibold">
                    Teams
                  </h2>

                  <p className="mt-1 text-sm text-[#726874]">
                    Organise staff underneath
                    departments and managers.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    departments.length === 0
                  }
                  onClick={() =>
                    setShowTeamForm(true)
                  }
                  className="flex items-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  <Plus size={16} />
                  Add Team
                </button>
              </div>

              <div className="divide-y divide-[#eee8ef]">
                {!loading &&
                departments.length === 0 ? (
                  <EmptyState
                    title="Create a department first"
                    text="Teams must belong to a department."
                  />
                ) : teams.length === 0 ? (
                  <EmptyState
                    title="No teams"
                    text="Create a team within one of your departments."
                  />
                ) : (
                  teams.map((team) => (
                    <TeamRow
                      key={team.id}
                      team={team}
                      onRefresh={load}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {showDepartmentForm ? (
        <DepartmentForm
          roles={roles}
          onClose={() =>
            setShowDepartmentForm(false)
          }
          onSaved={async () => {
            setShowDepartmentForm(false);
            await load();
          }}
        />
      ) : null}

      {showTeamForm ? (
        <TeamForm
          departments={departments}
          staff={staff}
          onClose={() =>
            setShowTeamForm(false)
          }
          onSaved={async () => {
            setShowTeamForm(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function DepartmentRow({
  department,
  roles,
  onRefresh,
}: {
  department: Department;
  roles: Role[];
  onRefresh: () => Promise<void>;
}) {
  const [showRoleManager, setShowRoleManager] =
    useState(false);
  async function remove() {
    const confirmed =
      window.confirm(
        `Delete ${department.name}?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      await apiFetch(
        `/admin/departments/${department.id}`,
        {
          method: 'DELETE',
        },
      );

      await onRefresh();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : 'Unable to delete department.',
      );
    }
  }

  return (
    <>
      <div className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f4eff6] text-[#36133b]">
          <Building2 size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {department.name}
          </p>

          <p className="mt-1 text-sm text-[#817681]">
            {department.description ||
              'No description'}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {department.roles?.length ? (
              department.roles.map((role) => (
                <span
                  key={role.id}
                  className="rounded-full bg-[#f4eff6] px-2.5 py-1 text-xs font-semibold text-[#36133b]"
                >
                  {role.name}
                </span>
              ))
            ) : (
              <span className="text-xs text-amber-700">
                No roles assigned
              </span>
            )}
          </div>
        </div>

        <div className="hidden gap-6 text-right sm:flex">
          <div>
            <p className="text-sm font-semibold">
              {department.staff_count}
            </p>

            <p className="text-xs text-[#817681]">
              Staff
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold">
              {department.team_count}
            </p>

            <p className="text-xs text-[#817681]">
              Teams
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowRoleManager(true)
          }
          className="rounded-lg border border-[#e7dde9] px-3 py-2 text-xs font-semibold text-[#36133b]"
        >
          Manage roles
        </button>

        <button
          type="button"
          onClick={remove}
          className="rounded-lg p-2 text-[#9a909b] transition hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={17} />
        </button>
      </div>

      {showRoleManager ? (
        <DepartmentRolesForm
          department={department}
          roles={roles}
          onClose={() =>
            setShowRoleManager(false)
          }
          onSaved={async () => {
            setShowRoleManager(false);
            await onRefresh();
          }}
        />
      ) : null}
    </>
  );
}

function TeamRow({
  team,
  onRefresh,
}: {
  team: Team;
  onRefresh: () => Promise<void>;
}) {
  async function remove() {
    if (
      !window.confirm(
        `Delete ${team.name}?`,
      )
    ) {
      return;
    }

    try {
      await apiFetch(
        `/admin/teams/${team.id}`,
        {
          method: 'DELETE',
        },
      );

      await onRefresh();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : 'Unable to delete team.',
      );
    }
  }

  return (
    <div className="flex items-center gap-4 p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f4eff6] text-[#36133b]">
        <Users size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {team.name}
        </p>

        <p className="mt-1 text-xs text-[#817681]">
          {team.department_name}
        </p>
      </div>

      <div className="hidden text-right md:block">
        <p className="text-sm font-medium">
          {team.manager_name ||
            'No manager'}
        </p>

        <p className="text-xs text-[#817681]">
          Manager
        </p>
      </div>

      <div className="hidden text-right sm:block">
        <p className="text-sm font-semibold">
          {team.member_count}
        </p>

        <p className="text-xs text-[#817681]">
          Members
        </p>
      </div>

      <button
        type="button"
        onClick={remove}
        className="rounded-lg p-2 text-[#9a909b] hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
}

function DepartmentForm({
  roles,
  onClose,
  onSaved,
}: {
  roles: Role[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] =
    useState('');

  const [
    description,
    setDescription,
  ] = useState('');

  const [roleIds, setRoleIds] =
    useState<string[]>([]);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);

      await apiFetch(
        '/admin/departments',
        {
          method: 'POST',

          body: JSON.stringify({
            name,
            description,
            roleIds,
          }),
        },
      );

      await onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to create department.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add Department"
      onClose={onClose}
    >
      <form
        onSubmit={submit}
        className="space-y-5"
      >
        {error ? (
          <ErrorBox text={error} />
        ) : null}

        <TextField
          label="Department name"
          value={name}
          onChange={setName}
          required
        />

        <TextArea
          label="Description"
          value={description}
          onChange={setDescription}
        />

        <RoleChecklist
          roles={roles}
          selected={roleIds}
          onChange={setRoleIds}
          helpText="Select the roles that can be assigned to staff in this department."
        />

        <FormActions
          onClose={onClose}
          saving={saving}
          label="Create Department"
        />
      </form>
    </Modal>
  );
}


function DepartmentRolesForm({
  department,
  roles,
  onClose,
  onSaved,
}: {
  department: Department;
  roles: Role[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [roleIds, setRoleIds] =
    useState<string[]>(
      department.roles?.map(
        (role) => role.id,
      ) ?? [],
    );

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);

      await apiFetch(
        `/admin/departments/${department.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            roleIds,
          }),
        },
      );

      await onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to update department roles.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Roles for ${department.name}`}
      onClose={onClose}
    >
      <form
        onSubmit={submit}
        className="space-y-5"
      >
        {error ? (
          <ErrorBox text={error} />
        ) : null}

        <RoleChecklist
          roles={roles}
          selected={roleIds}
          onChange={setRoleIds}
          helpText="Only these roles will appear when this department is selected while creating staff."
        />

        <FormActions
          onClose={onClose}
          saving={saving}
          label="Save Roles"
        />
      </form>
    </Modal>
  );
}

function RoleChecklist({
  roles,
  selected,
  onChange,
  helpText,
}: {
  roles: Role[];
  selected: string[];
  onChange: (ids: string[]) => void;
  helpText: string;
}) {
  return (
    <div>
      <label className="text-sm font-semibold">
        Department roles
      </label>

      <p className="mt-1 text-xs leading-5 text-[#817681]">
        {helpText}
      </p>

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[#e9e2ea] p-3">
        {roles.length === 0 ? (
          <p className="text-sm text-[#817681]">
            No roles are available.
          </p>
        ) : (
          roles.map((role) => (
            <label
              key={role.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#faf7fb]"
            >
              <input
                type="checkbox"
                checked={selected.includes(
                  role.id,
                )}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([
                      ...selected,
                      role.id,
                    ]);
                  } else {
                    onChange(
                      selected.filter(
                        (id) =>
                          id !== role.id,
                      ),
                    );
                  }
                }}
              />

              <div>
                <p className="text-sm font-semibold">
                  {role.name}
                </p>
                <p className="text-xs text-[#817681]">
                  {role.code}
                </p>
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function TeamForm({
  departments,
  staff,
  onClose,
  onSaved,
}: {
  departments: Department[];
  staff: Staff[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] =
    useState('');

  const [
    description,
    setDescription,
  ] = useState('');

  const [
    departmentId,
    setDepartmentId,
  ] = useState('');

  const [managerId, setManagerId] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);

      await apiFetch(
        '/admin/teams',
        {
          method: 'POST',

          body: JSON.stringify({
            name,
            description,
            departmentId,

            managerId:
              managerId || undefined,
          }),
        },
      );

      await onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to create team.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add Team"
      onClose={onClose}
    >
      <form
        onSubmit={submit}
        className="space-y-5"
      >
        {error ? (
          <ErrorBox text={error} />
        ) : null}

        <TextField
          label="Team name"
          value={name}
          onChange={setName}
          required
        />

        <TextArea
          label="Description"
          value={description}
          onChange={setDescription}
        />

        <div>
          <label className="text-sm font-semibold">
            Department
          </label>

          <select
            required
            value={departmentId}
            onChange={(event) =>
              setDepartmentId(
                event.target.value,
              )
            }
            className="mt-2 h-11 w-full rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"
          >
            <option value="">
              Select department
            </option>

            {departments.map(
              (department) => (
                <option
                  key={department.id}
                  value={department.id}
                >
                  {department.name}
                </option>
              ),
            )}
          </select>
        </div>

        <div>
          <label className="text-sm font-semibold">
            Team manager
          </label>

          <select
            value={managerId}
            onChange={(event) =>
              setManagerId(
                event.target.value,
              )
            }
            className="mt-2 h-11 w-full rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"
          >
            <option value="">
              No manager yet
            </option>

            {staff.map((member) => (
              <option
                key={member.id}
                value={member.id}
              >
                {member.first_name}{' '}
                {member.last_name}
              </option>
            ))}
          </select>
        </div>

        <FormActions
          onClose={onClose}
          saving={saving}
          label="Create Team"
        />
      </form>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />

      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold">
          {title}
        </h2>

        <div className="mt-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
      </label>

      <input
        required={required}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-11 w-full rounded-lg border border-[#e3dae4] px-3 text-sm outline-none focus:border-[#765078] focus:ring-4 focus:ring-[#f4eff6]"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
      </label>

      <textarea
        rows={4}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 w-full resize-none rounded-lg border border-[#e3dae4] p-3 text-sm outline-none focus:border-[#765078] focus:ring-4 focus:ring-[#f4eff6]"
      />
    </div>
  );
}

function FormActions({
  onClose,
  saving,
  label,
}: {
  onClose: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-[#eee8ef] pt-5">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-[#e7dde9] px-4 py-2.5 text-sm font-semibold"
      >
        Cancel
      </button>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving...' : label}
      </button>
    </div>
  );
}

function EmptyState({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="p-12 text-center">
      <p className="font-semibold">
        {title}
      </p>

      <p className="mt-2 text-sm text-[#817681]">
        {text}
      </p>
    </div>
  );
}

function ErrorBox({
  text,
}: {
  text: string;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {text}
    </div>
  );
}