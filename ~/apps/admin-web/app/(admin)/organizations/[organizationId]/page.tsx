'use client';

import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  FormEvent,
  useEffect,
  useState,
} from 'react';
import {
  useParams,
  useRouter,
} from 'next/navigation';

import { apiFetch } from '@/lib/api';

type Organization = {
  id: string;
  name: string;
  legal_name: string | null;
  organization_type:
    | 'PROSPECT'
    | 'CUSTOMER'
    | 'PARTNER'
    | 'OTHER';
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
  status:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'ARCHIVED';
  assigned_owner_id: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
};

type Contact = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
};

type Response<T> = {
  success: boolean;
  data: T;
};

type Tab =
  | 'overview'
  | 'contacts'
  | 'leads'
  | 'tasks'
  | 'activity';

export default function OrganizationDetailPage() {
  const { organizationId } =
    useParams<{
      organizationId: string;
    }>();

  const router = useRouter();

  const [organization, setOrganization] =
    useState<Organization | null>(null);
  const [contacts, setContacts] =
    useState<Contact[]>([]);
  const [tab, setTab] =
    useState<Tab>('overview');
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);
  const [contactDrawer, setContactDrawer] =
    useState<
      | { mode: 'create' }
      | {
          mode: 'edit';
          contact: Contact;
        }
      | null
    >(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [
        organizationResponse,
        contactResponse,
      ] = await Promise.all([
        apiFetch<Response<Organization>>(
          `/admin/organizations/${organizationId}`,
        ),
        apiFetch<Response<Contact[]>>(
          `/admin/contacts/organization/${organizationId}`,
        ),
      ]);

      setOrganization(
        organizationResponse.data,
      );
      setContacts(contactResponse.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load organization.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId]);

  async function deleteContact(
    contact: Contact,
  ) {
    if (
      !window.confirm(
        `Delete ${contact.first_name} ${contact.last_name} from this organization?`,
      )
    ) {
      return;
    }

    try {
      await apiFetch(
        `/admin/contacts/${contact.id}`,
        {
          method: 'DELETE',
        },
      );

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to delete contact.',
      );
    }
  }

  if (loading && !organization) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-[1450px] items-center justify-center text-sm text-[#817681]">
        Loading organization...
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="mx-auto max-w-[1450px]">
        <button
          onClick={() =>
            router.push('/organizations')
          }
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#36133b]"
        >
          <ArrowLeft size={16} />
          Organizations
        </button>

        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ??
            'Organization not found.'}
        </div>
      </div>
    );
  }

  const primary =
    contacts.find(
      (contact) => contact.is_primary,
    ) ?? null;

  return (
    <div className="mx-auto max-w-[1450px]">
      <button
        onClick={() =>
          router.push('/organizations')
        }
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#6f6170] transition hover:text-[#36133b]"
      >
        <ArrowLeft size={16} />
        Organizations
      </button>

      {error ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-[#e8e0e9] bg-white"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4eff6] text-[#36133b]">
              <Building2 size={26} />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold">
                  {organization.name}
                </h1>

                <span className="rounded-full bg-[#f4eff6] px-2.5 py-1 text-xs font-semibold text-[#36133b]">
                  {organization.organization_type}
                </span>

                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {organization.status}
                </span>
              </div>

              <p className="mt-2 text-sm text-[#726874]">
                {organization.industry ??
                  'No industry'}
                {' · '}
                {organization.owner_first_name
                  ? `Owned by ${organization.owner_first_name} ${organization.owner_last_name ?? ''}`.trim()
                  : 'Unassigned'}
              </p>

              <p className="mt-1 text-sm text-[#918693]">
                {organization.legal_name ??
                  'No legal name added'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-t border-[#eee8ef] px-5 pt-2">
          {(
            [
              'overview',
              'contacts',
              'leads',
              'tasks',
              'activity',
            ] as Tab[]
          ).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize transition ${
                tab === item
                  ? 'border-[#36133b] text-[#36133b]'
                  : 'border-transparent text-[#817681]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </motion.section>

      {tab === 'overview' ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
            <h2 className="text-lg font-semibold">
              Account overview
            </h2>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Info
                label="Industry"
                value={
                  organization.industry ??
                  'Not added'
                }
              />
              <Info
                label="Account owner"
                value={
                  organization.owner_first_name
                    ? `${organization.owner_first_name} ${organization.owner_last_name ?? ''}`.trim()
                    : 'Unassigned'
                }
              />
              <Info
                label="Email"
                value={
                  organization.email ??
                  'Not added'
                }
              />
              <Info
                label="Phone"
                value={
                  organization.phone ??
                  'Not added'
                }
              />
              <Info
                label="Website"
                value={
                  organization.website ??
                  'Not added'
                }
              />
              <Info
                label="Location"
                value={locationLabel(
                  organization,
                )}
              />
            </div>

            {organization.notes ? (
              <div className="mt-6 border-t border-[#eee8ef] pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#918693]">
                  Notes
                </p>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5d535e]">
                  {organization.notes}
                </p>
              </div>
            ) : null}
          </section>

          <aside className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
            <h2 className="text-lg font-semibold">
              Primary contact
            </h2>

            {primary ? (
              <div className="mt-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4eff6] font-bold text-[#36133b]">
                  {primary.first_name[0]}
                  {primary.last_name[0]}
                </div>

                <p className="mt-3 font-semibold">
                  {primary.first_name}{' '}
                  {primary.last_name}
                </p>

                <p className="mt-1 text-sm text-[#817681]">
                  {primary.job_title ??
                    'No job title'}
                </p>

                {primary.email ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-[#5d535e]">
                    <Mail size={15} />
                    {primary.email}
                  </p>
                ) : null}

                {primary.phone ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-[#5d535e]">
                    <Phone size={15} />
                    {primary.phone}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-[#faf7fb] p-4 text-sm text-[#817681]">
                No primary contact yet.
              </div>
            )}

            <button
              onClick={() => {
                setTab('contacts');
                setContactDrawer({
                  mode: 'create',
                });
              }}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#ddd3df] px-4 py-2.5 text-sm font-semibold text-[#36133b]"
            >
              <Plus size={16} />
              Add contact
            </button>
          </aside>
        </div>
      ) : null}

      {tab === 'contacts' ? (
        <section className="mt-6 rounded-2xl border border-[#e9e2ea] bg-white">
          <div className="flex items-center justify-between border-b border-[#eee8ef] p-5">
            <div>
              <h2 className="font-semibold">
                Contacts
              </h2>
              <p className="mt-1 text-sm text-[#817681]">
                People associated with this
                organization.
              </p>
            </div>

            <button
              onClick={() =>
                setContactDrawer({
                  mode: 'create',
                })
              }
              className="inline-flex items-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus size={16} />
              Add contact
            </button>
          </div>

          {contacts.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4eff6] text-[#36133b]">
                <UserRound size={21} />
              </div>
              <p className="mt-4 font-semibold">
                No contacts yet
              </p>
              <p className="mt-1 text-sm text-[#817681]">
                Add the first person associated
                with this account.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#eee8ef]">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4eff6] text-sm font-bold text-[#36133b]">
                      {contact.first_name[0]}
                      {contact.last_name[0]}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">
                          {contact.first_name}{' '}
                          {contact.last_name}
                        </p>

                        {contact.is_primary ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                            Primary
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-0.5 text-xs text-[#817681]">
                        {contact.job_title ??
                          'No job title'}
                        {contact.email
                          ? ` · ${contact.email}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <button
                      onClick={() =>
                        setContactDrawer({
                          mode: 'edit',
                          contact,
                        })
                      }
                      className="rounded-lg p-2 text-[#726874] hover:bg-[#f4eff6] hover:text-[#36133b]"
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      onClick={() =>
                        deleteContact(contact)
                      }
                      className="rounded-lg p-2 text-[#817681] hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'leads' ? (
        <ComingSoon
          title="Leads"
          description="Next, every sales opportunity for this organization will appear here with stage, owner, value and conversion history."
        />
      ) : null}

      {tab === 'tasks' ? (
        <ComingSoon
          title="Tasks"
          description="Tasks linked to this organization will appear here once the task engine is connected."
        />
      ) : null}

      {tab === 'activity' ? (
        <ComingSoon
          title="Account activity"
          description="Calls, emails, meetings, proposals and task updates will form the customer activity timeline here."
        />
      ) : null}

      {contactDrawer ? (
        <ContactDrawer
          organizationId={organization.id}
          contact={
            contactDrawer.mode === 'edit'
              ? contactDrawer.contact
              : undefined
          }
          onClose={() =>
            setContactDrawer(null)
          }
          onSaved={async () => {
            await load();
            setContactDrawer(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ContactDrawer({
  organizationId,
  contact,
  onClose,
  onSaved,
}: {
  organizationId: string;
  contact?: Contact;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [firstName, setFirstName] =
    useState(contact?.first_name ?? '');
  const [lastName, setLastName] =
    useState(contact?.last_name ?? '');
  const [jobTitle, setJobTitle] =
    useState(contact?.job_title ?? '');
  const [email, setEmail] =
    useState(contact?.email ?? '');
  const [phone, setPhone] =
    useState(contact?.phone ?? '');
  const [isPrimary, setIsPrimary] =
    useState(contact?.is_primary ?? false);
  const [notes, setNotes] =
    useState(contact?.notes ?? '');
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
        contact
          ? `/admin/contacts/${contact.id}`
          : '/admin/contacts',
        {
          method: contact
            ? 'PATCH'
            : 'POST',
          body: JSON.stringify({
            organizationId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            jobTitle:
              jobTitle.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
            isPrimary,
            notes: notes.trim() || null,
          }),
        },
      );

      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save contact.',
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
        initial={{ x: 30, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="absolute inset-y-0 right-0 w-full max-w-[560px] overflow-y-auto bg-white shadow-2xl"
      >
        <form
          onSubmit={submit}
          className="space-y-6 p-6"
        >
          <div>
            <h2 className="text-xl font-semibold">
              {contact
                ? 'Edit contact'
                : 'Add contact'}
            </h2>
            <p className="mt-1 text-sm text-[#817681]">
              Contact details for this
              organization.
            </p>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              value={firstName}
              onChange={setFirstName}
            />
            <Field
              label="Last name"
              value={lastName}
              onChange={setLastName}
            />
            <div className="sm:col-span-2">
              <Field
                label="Job title"
                value={jobTitle}
                onChange={setJobTitle}
              />
            </div>
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
            />
            <Field
              label="Phone"
              value={phone}
              onChange={setPhone}
            />
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-[#e7dde9] p-4">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(event) =>
                setIsPrimary(
                  event.target.checked,
                )
              }
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-semibold">
                Primary contact
              </p>
              <p className="mt-1 text-xs leading-5 text-[#817681]">
                Mark this person as the main
                contact for the organization.
              </p>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">
              Notes
            </span>
            <textarea
              rows={4}
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              className="mt-2 w-full resize-none rounded-lg border border-[#e3dae4] p-3 text-sm outline-none focus:border-[#765078]"
            />
          </label>

          <div className="flex gap-3 border-t border-[#eee8ef] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              className="flex-1 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : 'Save contact'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-10 w-full rounded-lg border border-[#e3dae4] px-3 text-sm outline-none focus:border-[#765078]"
      />
    </label>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#918693]">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-[#3c333d]">
        {value}
      </p>
    </div>
  );
}

function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-[#e9e2ea] bg-white p-8">
      <h2 className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#817681]">
        {description}
      </p>
    </section>
  );
}

function locationLabel(
  organization: Organization,
) {
  const parts = [
    organization.address_line1,
    organization.city,
    organization.state,
    organization.country,
  ].filter(Boolean);

  return parts.length
    ? parts.join(', ')
    : 'No location added';
}
