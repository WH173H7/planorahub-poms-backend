'use client';

import {
  ContactRound,
  Mail,
  Phone,
  Search,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiFetch } from '@/lib/api';

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  organization_id: string;
  organization_name: string;
  organization_type: string;
  organization_status: string;
};

type Response<T> = {
  success: boolean;
  data: T;
};

export default function ContactsPage() {
  const [contacts, setContacts] =
    useState<Contact[]>([]);
  const [search, setSearch] =
    useState('');
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response =
          await apiFetch<
            Response<Contact[]>
          >('/admin/contacts');

        setContacts(response.data);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load contacts.',
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return contacts;

    return contacts.filter((contact) =>
      [
        contact.first_name,
        contact.last_name,
        contact.email,
        contact.phone,
        contact.job_title,
        contact.organization_name,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(q),
        ),
    );
  }, [contacts, search]);

  return (
    <div className="mx-auto max-w-[1450px]">
      <div className="mb-8">
        <p className="text-sm font-medium text-[#7a6f7b]">
          CRM
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Contacts
        </h1>
        <p className="mt-2 text-sm text-[#726874]">
          People connected to your
          organizations and customer accounts.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e9e2ea] bg-white">
        <div className="border-b border-[#eee8ef] p-4">
          <div className="relative">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#958a96]"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search contacts or organizations..."
              className="h-10 w-full rounded-lg border border-[#e3dae4] pl-10 pr-3 text-sm outline-none focus:border-[#765078]"
            />
          </div>
        </div>

        {error ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center text-sm text-[#817681]">
            Loading contacts...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4eff6] text-[#36133b]">
              <ContactRound size={22} />
            </div>
            <p className="mt-4 font-semibold">
              No contacts found
            </p>
            <p className="mt-1 text-sm text-[#817681]">
              Add contacts from an
              organization profile.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#eee8ef]">
            {filtered.map((contact) => (
              <a
                key={contact.id}
                href={`/organizations/${contact.organization_id}`}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#fdfbfd]"
              >
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

                  <p className="mt-1 text-sm text-[#817681]">
                    {contact.job_title ??
                      'No job title'}
                    {' · '}
                    {contact.organization_name}
                  </p>
                </div>

                <div className="space-y-1 text-xs text-[#817681]">
                  {contact.email ? (
                    <p className="flex items-center gap-1.5">
                      <Mail size={13} />
                      {contact.email}
                    </p>
                  ) : null}

                  {contact.phone ? (
                    <p className="flex items-center gap-1.5">
                      <Phone size={13} />
                      {contact.phone}
                    </p>
                  ) : null}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
