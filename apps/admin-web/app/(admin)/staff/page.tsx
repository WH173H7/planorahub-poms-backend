'use client';

import {
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiFetch } from '@/lib/api';

type Staff = {
  id: string;

  first_name: string;
  last_name: string;

  email: string;
  phone: string | null;

  job_title: string | null;

  status:
    | 'INVITED'
    | 'ACTIVE'
    | 'SUSPENDED'
    | 'DISABLED';

  must_change_password: boolean;

  last_login_at: string | null;
  created_at: string;

  role_id: string;
  role_code: string;
  role_name: string;

  department_id: string | null;
  department_name: string | null;
};

type StaffResponse = {
  success: boolean;
  data: Staff[];
};

type Role = {
  id: string;
  code: string;
  name: string;
  department_ids: string[];
  permissions: Permission[];
};

type Department = {
  id: string;
  name: string;
};

type Team = {
  id: string;
  name: string;
  department_id: string;
  department_name: string;
};

type Permission = {
  id: string;
  code: string;
  name: string;
  module: string;
};

type DirectoryResponse<T> = {
  success: boolean;
  data: T[];
};

export default function StaffPage() {
  const [staff, setStaff] =
    useState<Staff[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState('');

  const [roleFilter, setRoleFilter] =
    useState('ALL');

  const [statusFilter, setStatusFilter] =
    useState('ALL');

  const [showCreateStaff, setShowCreateStaff] =
    useState(false);

  async function loadStaff() {
    try {
      setLoading(true);
      setError(null);

      const response =
        await apiFetch<StaffResponse>(
          '/admin/staff',
        );

      setStaff(response.data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to load staff.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStaff();
  }, []);

  const roles = useMemo(() => {
    return Array.from(
      new Map(
        staff.map((member) => [
          member.role_code,
          member.role_name,
        ]),
      ).entries(),
    );
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return staff.filter((member) => {
      const matchesSearch =
        !query ||
        `${member.first_name} ${member.last_name}`
          .toLowerCase()
          .includes(query) ||
        member.email
          .toLowerCase()
          .includes(query) ||
        member.job_title
          ?.toLowerCase()
          .includes(query);

      const matchesRole =
        roleFilter === 'ALL' ||
        member.role_code === roleFilter;

      const matchesStatus =
        statusFilter === 'ALL' ||
        member.status === statusFilter;

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus
      );
    });
  }, [
    staff,
    search,
    roleFilter,
    statusFilter,
  ]);

  return (
    <div className="mx-auto max-w-[1450px]">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#7a6f7b]">
            Team administration
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Staff Management
          </h1>

          <p className="mt-2 text-sm text-[#726874]">
            Create accounts, assign roles,
            manage departments and control
            staff access.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowCreateStaff(true)
          }
          className="flex items-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2c0f31]"
        >
          <UserPlus size={17} />
          Add Staff
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total staff"
          value={staff.length}
        />

        <SummaryCard
          label="Active"
          value={
            staff.filter(
              (member) =>
                member.status === 'ACTIVE',
            ).length
          }
        />

        <SummaryCard
          label="Pending setup"
          value={
            staff.filter(
              (member) =>
                member.status === 'INVITED' ||
                member.must_change_password,
            ).length
          }
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-[#e9e2ea] bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#eee8ef] p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#958a96]"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search staff by name, email or job title..."
              className="h-10 w-full rounded-lg border border-[#e3dae4] bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#765078] focus:ring-4 focus:ring-[#f4eff6]"
            />
          </div>

          <div className="flex items-center gap-2 text-[#817681]">
            <SlidersHorizontal size={16} />
          </div>

          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(
                event.target.value,
              )
            }
            className="h-10 rounded-lg border border-[#e3dae4] bg-white px-3 text-sm outline-none focus:border-[#765078]"
          >
            <option value="ALL">
              All roles
            </option>

            {roles.map(
              ([code, name]) => (
                <option
                  key={code}
                  value={code}
                >
                  {name}
                </option>
              ),
            )}
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value,
              )
            }
            className="h-10 rounded-lg border border-[#e3dae4] bg-white px-3 text-sm outline-none focus:border-[#765078]"
          >
            <option value="ALL">
              All statuses
            </option>
            <option value="ACTIVE">
              Active
            </option>
            <option value="INVITED">
              Invited
            </option>
            <option value="SUSPENDED">
              Suspended
            </option>
            <option value="DISABLED">
              Disabled
            </option>
          </select>
        </div>

        {error ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center text-sm text-[#817681]">
            Loading staff...
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4eff6] text-[#36133b]">
              <Users size={22} />
            </div>

            <p className="mt-4 font-semibold">
              No staff found
            </p>

            <p className="mt-1 max-w-sm text-sm leading-6 text-[#817681]">
              Try adjusting your filters or
              create a new staff account.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-[#faf7fb]">
                <tr className="text-xs uppercase tracking-wide text-[#8b818c]">
                  <th className="px-5 py-3 font-semibold">
                    Staff member
                  </th>

                  <th className="px-5 py-3 font-semibold">
                    Role
                  </th>

                  <th className="px-5 py-3 font-semibold">
                    Department
                  </th>

                  <th className="px-5 py-3 font-semibold">
                    Status
                  </th>

                  <th className="px-5 py-3 font-semibold">
                    Last login
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#eee8ef]">
                {filteredStaff.map(
                  (member) => (
                    <tr
                      key={member.id}
                      className="transition hover:bg-[#fdfbfd]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f4eff6] text-sm font-bold text-[#36133b]">
                            {member.first_name[0]}
                            {member.last_name[0]}
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold text-[#231d24]">
                              {
                                member.first_name
                              }{' '}
                              {
                                member.last_name
                              }
                            </p>

                            <p className="mt-0.5 text-xs text-[#817681]">
                              {member.email}
                            </p>

                            {member.job_title ? (
                              <p className="mt-0.5 text-xs text-[#9b919c]">
                                {
                                  member.job_title
                                }
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-[#514851]">
                        {member.role_name}
                      </td>

                      <td className="px-5 py-4 text-sm text-[#514851]">
                        {member.department_name ??
                          '—'}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge
                          status={
                            member.status
                          }
                        />
                      </td>

                      <td className="px-5 py-4 text-sm text-[#817681]">
                        {member.last_login_at
                          ? new Date(
                              member.last_login_at,
                            ).toLocaleString()
                          : 'Never'}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreateStaff ? (
        <CreateStaffDrawer
          onClose={() =>
            setShowCreateStaff(false)
          }
          onCreated={async () => {
            await loadStaff();
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-[#e9e2ea] bg-white p-5">
      <p className="text-sm text-[#726874]">
        {label}
      </p>

      <p className="mt-3 text-3xl font-semibold">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: Staff['status'];
}) {
  const classes = {
    ACTIVE:
      'bg-emerald-50 text-emerald-700',

    INVITED:
      'bg-amber-50 text-amber-700',

    SUSPENDED:
      'bg-orange-50 text-orange-700',

    DISABLED:
      'bg-slate-100 text-slate-600',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes[status]}`}
    >
      {status}
    </span>
  );
}

function CreateStaffDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [roles, setRoles] =
    useState<Role[]>([]);

  const [departments, setDepartments] =
    useState<Department[]>([]);

  const [teams, setTeams] =
    useState<Team[]>([]);

  const [permissions, setPermissions] =
    useState<Permission[]>([]);

  const [firstName, setFirstName] =
    useState('');

  const [lastName, setLastName] =
    useState('');

  const [email, setEmail] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [jobTitle, setJobTitle] =
    useState('');

  const [roleId, setRoleId] =
    useState('');

  const [departmentId, setDepartmentId] =
    useState('');

  const [teamIds, setTeamIds] =
    useState<string[]>([]);

  const [
    permissionOverrides,
    setPermissionOverrides,
  ] = useState<
    Record<
      string,
      'DEFAULT' | 'ALLOW' | 'DENY'
    >
  >({});

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    temporaryPassword,
    setTemporaryPassword,
  ] = useState<string | null>(null);

  const [passwordCopied, setPasswordCopied] =
    useState(false);

  const [showAllPermissions, setShowAllPermissions] =
    useState(false);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [
          rolesResponse,
          departmentsResponse,
          teamsResponse,
          permissionsResponse,
        ] = await Promise.all([
          apiFetch<
            DirectoryResponse<Role>
          >('/admin/roles'),

          apiFetch<
            DirectoryResponse<Department>
          >('/admin/departments'),

          apiFetch<
            DirectoryResponse<Team>
          >('/admin/teams'),

          apiFetch<
            DirectoryResponse<Permission>
          >('/admin/permissions'),
        ]);

        setRoles(rolesResponse.data);

        setDepartments(
          departmentsResponse.data,
        );

        setTeams(teamsResponse.data);

        setPermissions(
          permissionsResponse.data,
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Unable to load staff setup options.',
        );
      } finally {
        setLoading(false);
      }
    }

    void loadOptions();
  }, []);

  const availableRoles =
    departmentId
      ? roles.filter((role) =>
          role.department_ids.includes(
            departmentId,
          ),
        )
      : [];

  const availableTeams =
    departmentId
      ? teams.filter(
          (team) =>
            team.department_id ===
            departmentId,
        )
      : [];

  const selectedRole =
    roles.find(
      (role) => role.id === roleId,
    ) ?? null;

  const inheritedPermissionIds =
    new Set(
      selectedRole?.permissions.map(
        (permission) => permission.id,
      ) ?? [],
    );

  const relevantModules =
    new Set(
      selectedRole?.permissions.map(
        (permission) => permission.module,
      ) ?? [],
    );

  const visiblePermissions =
    !selectedRole
      ? []
      : showAllPermissions
        ? permissions
        : permissions.filter(
            (permission) =>
              relevantModules.has(
                permission.module,
              ),
          );

  const permissionsByModule =
    visiblePermissions.reduce<
      Record<string, Permission[]>
    >((groups, permission) => {
      groups[permission.module] ??= [];

      groups[permission.module].push(
        permission,
      );

      return groups;
    }, {});

  async function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !departmentId ||
      !roleId
    ) {
      setError(
        'First name, last name, email, department and role are required.',
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    const overrides =
      Object.entries(
        permissionOverrides,
      )
        .filter(
          ([, effect]) =>
            effect !== 'DEFAULT',
        )
        .map(
          ([permissionId, effect]) => ({
            permissionId,
            effect:
              effect as 'ALLOW' | 'DENY',
          }),
        );

    try {
      const response =
        await apiFetch<{
          success: boolean;
          data: {
            temporaryPassword: string;
          };
        }>('/admin/staff', {
          method: 'POST',

          body: JSON.stringify({
            firstName:
              firstName.trim(),

            lastName:
              lastName.trim(),

            email:
              email
                .trim()
                .toLowerCase(),

            phone:
              phone.trim() || undefined,

            jobTitle:
              jobTitle.trim() ||
              undefined,

            roleId,

            departmentId:
              departmentId ||
              undefined,

            teamIds,

            permissionOverrides:
              overrides,
          }),
        });

      setTemporaryPassword(
        response.data
          .temporaryPassword,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to create staff account.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (temporaryPassword) {
    return (
      <div className="fixed inset-0 z-[100]">
        <div className="absolute inset-0 bg-black/20" />

        <div className="absolute inset-y-0 right-0 w-full max-w-[560px] overflow-y-auto border-l border-[#e7dde9] bg-white shadow-2xl">
          <div className="p-7">
            <h2 className="text-xl font-semibold">
              Staff account created
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#726874]">
              Share this temporary
              password securely with the
              staff member. It should only
              be shown once.
            </p>

            <div className="mt-6 rounded-xl bg-[#f4eff6] p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#726874]">
                Staff email
              </p>

              <p className="mt-2 break-all text-sm font-medium text-[#36133b]">
                {email.trim().toLowerCase()}
              </p>

              <div className="mt-5 border-t border-[#dfd2e1] pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#726874]">
                  Temporary password
                </p>

                <code className="mt-2 block break-all text-base font-semibold text-[#36133b]">
                  {temporaryPassword}
                </code>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        temporaryPassword,
                      );
                      setPasswordCopied(true);
                    } catch {
                      setPasswordCopied(false);
                    }
                  }}
                  className="mt-4 rounded-lg border border-[#d8c9da] bg-white px-3 py-2 text-sm font-semibold text-[#36133b] transition hover:bg-[#fbf8fc]"
                >
                  {passwordCopied
                    ? 'Copied'
                    : 'Copy password'}
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-[#817681]">
              For security, this password should only be shown once.
              The staff member should change it after first login.
            </p>

            <button
              type="button"
              onClick={async () => {
                await onCreated();
                onClose();
              }}
              className="mt-6 w-full rounded-lg bg-[#36133b] px-4 py-3 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />

      <div className="absolute inset-y-0 right-0 w-full max-w-[620px] overflow-y-auto border-l border-[#e7dde9] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-[#eee8ef] bg-white px-6 py-5">
          <h2 className="text-xl font-semibold">
            Add Staff
          </h2>

          <p className="mt-1 text-sm text-[#726874]">
            Create an account and
            configure access.
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-[#726874]">
            Loading staff setup...
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="space-y-8 p-6"
          >
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <section>
              <h3 className="font-semibold">
                Personal details
              </h3>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="First name"
                  value={firstName}
                  onChange={setFirstName}
                  required
                />

                <Field
                  label="Last name"
                  value={lastName}
                  onChange={setLastName}
                  required
                />

                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  required
                />

                <Field
                  label="Phone"
                  value={phone}
                  onChange={setPhone}
                />

                <div className="sm:col-span-2">
                  <Field
                    label="Job title"
                    value={jobTitle}
                    onChange={setJobTitle}
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="font-semibold">
                Role & organisation
              </h3>

              <div className="mt-4 space-y-4">
                <SelectField
                  label="Department"
                  value={departmentId}
                  onChange={(value) => {
                    setDepartmentId(value);
                    setRoleId('');
                    setTeamIds([]);
                    setPermissionOverrides({});
                    setShowAllPermissions(false);
                  }}
                  options={departments.map(
                    (department) => ({
                      value:
                        department.id,
                      label:
                        department.name,
                    }),
                  )}
                  required
                />

                <SelectField
                  label="Role"
                  value={roleId}
                  onChange={(value) => {
                    setRoleId(value);
                    setPermissionOverrides({});
                    setShowAllPermissions(false);
                  }}
                  options={availableRoles.map(
                    (role) => ({
                      value: role.id,
                      label: role.name,
                    }),
                  )}
                  required
                />

                {departmentId &&
                availableRoles.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    No roles have been assigned to this department yet.
                    Add department roles from Settings first.
                  </p>
                ) : null}

                <div>
                  <label className="text-sm font-semibold">
                    Teams
                  </label>

                  <div className="mt-2 space-y-2">
                    {availableTeams.length ===
                    0 ? (
                      <p className="text-sm text-[#817681]">
                        No teams available.
                      </p>
                    ) : (
                      availableTeams.map(
                        (team) => (
                          <label
                            key={team.id}
                            className="flex items-center gap-3 rounded-lg border border-[#e7dde9] p-3"
                          >
                            <input
                              type="checkbox"
                              checked={teamIds.includes(
                                team.id,
                              )}
                              onChange={(
                                event,
                              ) => {
                                if (
                                  event
                                    .target
                                    .checked
                                ) {
                                  setTeamIds(
                                    (
                                      current,
                                    ) => [
                                      ...current,
                                      team.id,
                                    ],
                                  );
                                } else {
                                  setTeamIds(
                                    (
                                      current,
                                    ) =>
                                      current.filter(
                                        (
                                          id,
                                        ) =>
                                          id !==
                                          team.id,
                                      ),
                                  );
                                }
                              }}
                            />

                            <div>
                              <p className="text-sm font-semibold">
                                {team.name}
                              </p>

                              <p className="text-xs text-[#817681]">
                                {
                                  team.department_name
                                }
                              </p>
                            </div>
                          </label>
                        ),
                      )
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">
                    Access & permissions
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-[#726874]">
                    Permissions marked Inherited come from the selected role.
                    Use Allow or Deny only when this staff member needs an individual override.
                  </p>
                </div>

                {selectedRole ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-[#5f5560]">
                    <input
                      type="checkbox"
                      checked={showAllPermissions}
                      onChange={(event) =>
                        setShowAllPermissions(
                          event.target.checked,
                        )
                      }
                    />
                    Show all system permissions
                  </label>
                ) : null}
              </div>

              {!roleId ? (
                <div className="mt-4 rounded-xl border border-dashed border-[#d9cedb] bg-[#fcfafc] p-5 text-sm text-[#817681]">
                  Select a department and role to configure permissions.
                </div>
              ) : Object.keys(
                  permissionsByModule,
                ).length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-[#d9cedb] bg-[#fcfafc] p-5 text-sm text-[#817681]">
                  This role has no permission scope configured yet.
                </div>
              ) : (
                <div className="mt-4 space-y-5">
                  {Object.entries(
                    permissionsByModule,
                  ).map(
                    ([
                      module,
                      modulePermissions,
                    ]) => (
                      <div
                        key={module}
                        className="rounded-xl border border-[#e9e2ea]"
                      >
                        <div className="border-b border-[#eee8ef] bg-[#faf7fb] px-4 py-3">
                          <p className="text-sm font-semibold capitalize">
                            {module}
                          </p>
                        </div>

                        <div className="divide-y divide-[#eee8ef]">
                          {modulePermissions.map(
                            (permission) => {
                              const inherited =
                                inheritedPermissionIds.has(
                                  permission.id,
                                );

                              return (
                                <div
                                  key={permission.id}
                                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                                >
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-medium">
                                        {permission.name}
                                      </p>

                                      <span
                                        className={[
                                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                                          inherited
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-slate-100 text-slate-600',
                                        ].join(' ')}
                                      >
                                        Role default:{' '}
                                        {inherited
                                          ? 'Allowed'
                                          : 'Denied'}
                                      </span>
                                    </div>
                                  </div>

                                  <select
                                    value={
                                      permissionOverrides[
                                        permission.id
                                      ] ?? 'DEFAULT'
                                    }
                                    onChange={(event) =>
                                      setPermissionOverrides(
                                        (current) => ({
                                          ...current,
                                          [permission.id]:
                                            event.target.value as
                                              | 'DEFAULT'
                                              | 'ALLOW'
                                              | 'DENY',
                                        }),
                                      )
                                    }
                                    aria-label={`Access override for ${permission.name}`}
                                    className="h-9 w-[116px] shrink-0 rounded-lg border border-[#ddd3df] bg-white px-3 text-xs font-semibold text-[#4f4550] shadow-sm outline-none transition hover:border-[#bba9be] focus:border-[#765078] focus:ring-4 focus:ring-[#f4eff6]"
                                  >
                                    <option value="DEFAULT">
                                      Default
                                    </option>
                                    <option value="ALLOW">
                                      Allow
                                    </option>
                                    <option value="DENY">
                                      Deny
                                    </option>
                                  </select>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#eee8ef] bg-white py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#e7dde9] px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#36133b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting
                  ? 'Creating...'
                  : 'Create Staff'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
      </label>

      <input
        type={type}
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

function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;

  options: Array<{
    value: string;
    label: string;
  }>;

  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
      </label>

      <select
        required={required}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-11 w-full rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"
      >
        <option value="">
          Select {label.toLowerCase()}
        </option>

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}