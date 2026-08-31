'use client';

import {
  Archive,
  Building2,
  Edit3,
  Globe2,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiFetch } from '@/lib/api';

type OrganizationType =
  | 'PROSPECT'
  | 'CUSTOMER'
  | 'PARTNER'
  | 'OTHER';

type OrganizationStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ARCHIVED';

type Organization = {
  id: string;
  name: string;
  legal_name: string | null;
  organization_type: OrganizationType;
  industry: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  notes: string | null;
  assigned_owner_id: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
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

export default function OrganizationsPage() {
  const router = useRouter();

  const [organizations, setOrganizations] =
    useState<Organization[]>([]);
  const [staff, setStaff] =
    useState<Staff[]>([]);
  const [search, setSearch] =
    useState('');
  const [type, setType] =
    useState<'ALL' | OrganizationType>('ALL');
  const [status, setStatus] =
    useState<'ALL' | OrganizationStatus>(
      'ALL',
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);
  const [drawer, setDrawer] =
    useState<
      | { mode: 'create' }
      | {
          mode: 'edit';
          organization: Organization;
        }
      | null
    >(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [organizationResponse, staffResponse] =
        await Promise.all([
          apiFetch<Response<Organization[]>>(
            '/admin/organizations',
          ),
          apiFetch<Response<Staff[]>>(
            '/admin/staff',
          ),
        ]);

      setOrganizations(
        organizationResponse.data,
      );
      setStaff(staffResponse.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load organizations.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return organizations.filter((item) => {
      const matchesQuery =
        !q ||
        item.name
          .toLowerCase()
          .includes(q) ||
        item.legal_name
          ?.toLowerCase()
          .includes(q) ||
        item.industry
          ?.toLowerCase()
          .includes(q) ||
        item.email
          ?.toLowerCase()
          .includes(q);

      return (
        matchesQuery &&
        (type === 'ALL' ||
          item.organization_type === type) &&
        (status === 'ALL' ||
          item.status === status)
      );
    });
  }, [
    organizations,
    search,
    type,
    status,
  ]);

  const active =
    organizations.filter(
      (item) => item.status === 'ACTIVE',
    ).length;

  const customers =
    organizations.filter(
      (item) =>
        item.organization_type ===
        'CUSTOMER',
    ).length;

  const prospects =
    organizations.filter(
      (item) =>
        item.organization_type ===
        'PROSPECT',
    ).length;

  async function changeStatus(
    item: Organization,
    next: OrganizationStatus,
  ) {
    if (
      next === 'ARCHIVED' &&
      !window.confirm(
        `Archive ${item.name}? The record will remain available for reporting and can be restored later.`,
      )
    ) {
      return;
    }

    try {
      await apiFetch(
        `/admin/organizations/${item.id}/status`,
        {
          method: 'POST',
          body: JSON.stringify({
            status: next,
          }),
        },
      );

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update organization status.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-[1450px]">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#7a6f7b]">
            CRM
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Organizations
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#726874]">
            Keep every prospect, customer,
            partner and company in one place
            so leads, contacts and tasks can
            attach to the same account.
          </p>
        </div>

        <button
          onClick={() =>
            setDrawer({ mode: 'create' })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2c0f31]"
        >
          <Plus size={17} />
          Add organization
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="Total organizations"
          value={organizations.length}
        />
        <Summary
          label="Active accounts"
          value={active}
        />
        <Summary
          label="Prospects"
          value={prospects}
        />
        <Summary
          label="Customers"
          value={customers}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e9e2ea] bg-white">
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
              placeholder="Search organizations, industry or email..."
              className="h-10 w-full rounded-lg border border-[#e3dae4] bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#765078] focus:ring-4 focus:ring-[#f4eff6]"
            />
          </div>

          <select
            value={type}
            onChange={(event) =>
              setType(
                event.target.value as
                  | 'ALL'
                  | OrganizationType,
              )
            }
            className="h-10 rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"
          >
            <option value="ALL">
              All types
            </option>
            <option value="PROSPECT">
              Prospects
            </option>
            <option value="CUSTOMER">
              Customers
            </option>
            <option value="PARTNER">
              Partners
            </option>
            <option value="OTHER">
              Other
            </option>
          </select>

          <select
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as
                  | 'ALL'
                  | OrganizationStatus,
              )
            }
            className="h-10 rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"
          >
            <option value="ALL">
              All statuses
            </option>
            <option value="ACTIVE">
              Active
            </option>
            <option value="INACTIVE">
              Inactive
            </option>
            <option value="ARCHIVED">
              Archived
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
            Loading organizations...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            hasOrganizations={
              organizations.length > 0
            }
            onCreate={() =>
              setDrawer({ mode: 'create' })
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-[#faf7fb]">
                <tr className="text-xs uppercase tracking-wide text-[#8b818c]">
                  <th className="px-5 py-3 font-semibold">
                    Organization
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Type
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Industry
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Account owner
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Status
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Contact
                  </th>
                  <th className="w-[70px] px-5 py-3" />
                </tr>
              </thead>

              <tbody className="divide-y divide-[#eee8ef]">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() =>
                      router.push(`/organizations/${item.id}`)
                    }
                    className="cursor-pointer transition hover:bg-[#f8f3f9]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4eff6] font-bold text-[#36133b]">
                          <Building2 size={18} />
                        </div>

                        <div>
                          <p className="font-semibold text-[#281f29]">
                            {item.name}
                          </p>
                          <p className="mt-0.5 text-xs text-[#918693]">
                            {locationLabel(
                              item,
                            )}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <TypeBadge
                        type={
                          item.organization_type
                        }
                      />
                    </td>

                    <td className="px-5 py-4 text-sm text-[#5d535e]">
                      {item.industry ?? '—'}
                    </td>

                    <td className="px-5 py-4 text-sm text-[#5d535e]">
                      {item.owner_first_name
                        ? `${item.owner_first_name} ${item.owner_last_name ?? ''}`.trim()
                        : 'Unassigned'}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge
                        status={item.status}
                      />
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1 text-xs text-[#817681]">
                        {item.email ? (
                          <p className="flex items-center gap-1.5">
                            <Mail size={13} />
                            {item.email}
                          </p>
                        ) : null}

                        {item.phone ? (
                          <p className="flex items-center gap-1.5">
                            <Phone size={13} />
                            {item.phone}
                          </p>
                        ) : null}

                        {!item.email &&
                        !item.phone
                          ? '—'
                          : null}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          title="Edit"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDrawer({
                              mode: 'edit',
                              organization: item,
                            });
                          }}
                          className="rounded-lg p-2 text-[#726874] transition hover:bg-[#f4eff6] hover:text-[#36133b]"
                        >
                          <Edit3 size={16} />
                        </button>

                        {item.status ===
                        'ARCHIVED' ? (
                          <button
                            title="Restore"
                            onClick={(event) => {
                              event.stopPropagation();
                              void changeStatus(
                                item,
                                'ACTIVE',
                              );
                            }}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            title="Archive"
                            onClick={(event) => {
                              event.stopPropagation();
                              void changeStatus(
                                item,
                                'ARCHIVED',
                              );
                            }}
                            className="rounded-lg p-2 text-[#817681] transition hover:bg-red-50 hover:text-red-700"
                          >
                            <Archive
                              size={16}
                            />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawer ? (
        <OrganizationDrawer
          mode={drawer.mode}
          organization={
            drawer.mode === 'edit'
              ? drawer.organization
              : undefined
          }
          staff={staff}
          onClose={() =>
            setDrawer(null)
          }
          onSaved={async () => {
            await load();
            setDrawer(null);
          }}
        />
      ) : null}
    </div>
  );
}

function OrganizationDrawer({
  mode,
  organization,
  staff,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  organization?: Organization;
  staff: Staff[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(
    organization?.name ?? '',
  );
  const [legalName, setLegalName] =
    useState(
      organization?.legal_name ?? '',
    );
  const [organizationType, setOrganizationType] =
    useState<OrganizationType>(
      organization?.organization_type ??
        'PROSPECT',
    );
  const [industry, setIndustry] =
    useState(
      organization?.industry ?? '',
    );
  const [email, setEmail] =
    useState(
      organization?.email ?? '',
    );
  const [phone, setPhone] =
    useState(
      organization?.phone ?? '',
    );
  const [website, setWebsite] =
    useState(
      organization?.website ?? '',
    );
  const [addressLine1, setAddressLine1] =
    useState(
      organization?.address_line1 ?? '',
    );
  const [city, setCity] =
    useState(
      organization?.city ?? '',
    );
  const [state, setState] =
    useState(
      organization?.state ?? '',
    );
  const [country, setCountry] =
    useState(
      organization?.country ??
        'Nigeria',
    );
  const [notes, setNotes] =
    useState(
      organization?.notes ?? '',
    );
  const [ownerId, setOwnerId] =
    useState(
      organization?.assigned_owner_id ??
        '',
    );

  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!name.trim()) {
      setError(
        'Organization name is required.',
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const body = {
        name: name.trim(),
        legalName:
          legalName.trim() || null,
        organizationType,
        industry:
          industry.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website:
          website.trim() || null,
        addressLine1:
          addressLine1.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        country:
          country.trim() || null,
        notes: notes.trim() || null,
        assignedOwnerId:
          ownerId || null,
      };

      await apiFetch(
        mode === 'create'
          ? '/admin/organizations'
          : `/admin/organizations/${organization!.id}`,
        {
          method:
            mode === 'create'
              ? 'POST'
              : 'PATCH',
          body: JSON.stringify(body),
        },
      );

      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save organization.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/25"
      />

      <motion.div
        initial={{ x: 35, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="absolute inset-y-0 right-0 w-full max-w-[660px] overflow-y-auto border-l border-[#e7dde9] bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 border-b border-[#eee8ef] bg-white px-6 py-5">
          <h2 className="text-xl font-semibold">
            {mode === 'create'
              ? 'Add organization'
              : 'Edit organization'}
          </h2>

          <p className="mt-1 text-sm text-[#817681]">
            Create one account record now;
            contacts, leads and tasks will
            attach to it next.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-7 p-6"
        >
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <FormSection title="Account details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Organization name"
                value={name}
                onChange={setName}
                required
              />

              <Field
                label="Legal name"
                value={legalName}
                onChange={setLegalName}
              />

              <SelectField
                label="Type"
                value={organizationType}
                onChange={(value) =>
                  setOrganizationType(
                    value as OrganizationType,
                  )
                }
                options={[
                  {
                    value: 'PROSPECT',
                    label: 'Prospect',
                  },
                  {
                    value: 'CUSTOMER',
                    label: 'Customer',
                  },
                  {
                    value: 'PARTNER',
                    label: 'Partner',
                  },
                  {
                    value: 'OTHER',
                    label: 'Other',
                  },
                ]}
              />

              <Field
                label="Industry"
                value={industry}
                onChange={setIndustry}
              />

              <div className="sm:col-span-2">
                <SelectField
                  label="Account owner"
                  value={ownerId}
                  onChange={setOwnerId}
                  optional
                  options={staff
                    .filter(
                      (member) =>
                        member.status !==
                        'DISABLED',
                    )
                    .map((member) => ({
                      value: member.id,
                      label: `${member.first_name} ${member.last_name}`,
                    }))}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
              />

              <Field
                label="Phone"
                value={phone}
                onChange={setPhone}
              />

              <div className="sm:col-span-2">
                <Field
                  label="Website"
                  value={website}
                  onChange={setWebsite}
                  placeholder="https://..."
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Location">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Address"
                  value={addressLine1}
                  onChange={setAddressLine1}
                />
              </div>

              <Field
                label="City"
                value={city}
                onChange={setCity}
              />

              <Field
                label="State"
                value={state}
                onChange={setState}
              />

              <div className="sm:col-span-2">
                <Field
                  label="Country"
                  value={country}
                  onChange={setCountry}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Notes">
            <textarea
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              rows={5}
              placeholder="Important context about this account..."
              className="w-full resize-none rounded-lg border border-[#e3dae4] p-3 text-sm outline-none transition focus:border-[#765078] focus:ring-4 focus:ring-[#f4eff6]"
            />
          </FormSection>

          <div className="sticky bottom-0 flex gap-3 border-t border-[#eee8ef] bg-white py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[#ddd3df] px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>

            <button
              disabled={saving}
              className="flex-1 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : mode === 'create'
                  ? 'Create organization'
                  : 'Save changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function Summary({
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

function TypeBadge({
  type,
}: {
  type: OrganizationType;
}) {
  const classes = {
    PROSPECT:
      'bg-blue-50 text-blue-700',
    CUSTOMER:
      'bg-emerald-50 text-emerald-700',
    PARTNER:
      'bg-violet-50 text-violet-700',
    OTHER:
      'bg-slate-100 text-slate-600',
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes[type]}`}
    >
      {capitalize(type)}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: OrganizationStatus;
}) {
  const classes = {
    ACTIVE:
      'bg-emerald-50 text-emerald-700',
    INACTIVE:
      'bg-amber-50 text-amber-700',
    ARCHIVED:
      'bg-slate-100 text-slate-600',
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes[status]}`}
    >
      {capitalize(status)}
    </span>
  );
}

function Empty({
  hasOrganizations,
  onCreate,
}: {
  hasOrganizations: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
      <div className="flex h-13 w-13 items-center justify-center rounded-full bg-[#f4eff6] p-3 text-[#36133b]">
        <Building2 size={23} />
      </div>

      <h3 className="mt-4 font-semibold">
        {hasOrganizations
          ? 'No matching organizations'
          : 'Create your first organization'}
      </h3>

      <p className="mt-1 max-w-md text-sm leading-6 text-[#817681]">
        {hasOrganizations
          ? 'Adjust the search or filters to find another account.'
          : 'Start with a prospect, customer or partner. Leads and tasks will connect to these account records.'}
      </p>

      {!hasOrganizations ? (
        <button
          onClick={onCreate}
          className="mt-5 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Add organization
        </button>
      ) : null}
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="font-semibold">
        {title}
      </h3>
      <div className="mt-4">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
      </span>

      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-10 w-full rounded-lg border border-[#e3dae4] px-3 text-sm outline-none transition focus:border-[#765078] focus:ring-4 focus:ring-[#f4eff6]"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-10 w-full rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"
      >
        {optional ? (
          <option value="">
            Unassigned
          </option>
        ) : null}

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function locationLabel(
  item: Organization,
) {
  const parts = [
    item.city,
    item.state,
    item.country,
  ].filter(Boolean);

  return parts.length
    ? parts.join(', ')
    : item.legal_name ??
        'No location added';
}

function capitalize(value: string) {
  return value
    .toLowerCase()
    .replace(
      /^./,
      (letter) => letter.toUpperCase(),
    );
}
