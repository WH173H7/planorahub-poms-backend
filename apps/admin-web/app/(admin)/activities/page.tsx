'use client';

import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Activity = {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  description: string | null;
  outcome: string | null;
  organization_id: string | null;
  organization_name: string | null;
  contact_id: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  lead_id: string | null;
  lead_title: string | null;
  assigned_to_id: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  next_follow_up_at: string | null;
};

type Organization = { id: string; name: string };
type Contact = {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string;
};
type Lead = {
  id: string;
  organization_id: string | null;
  title: string;
};
type Staff = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

type R<T> = { success: boolean; data: T };

const TYPES = ['CALL','MEETING','EMAIL','FOLLOW_UP','NOTE','OTHER'];
const STATUSES = ['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'];

export default function ActivitiesPage() {
  const [items, setItems] = useState<Activity[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [activitiesR, orgsR, contactsR, leadsR, staffR] = await Promise.all([
        apiFetch<R<Activity[]>>('/admin/activities'),
        apiFetch<R<Organization[]>>('/admin/organizations'),
        apiFetch<R<Contact[]>>('/admin/contacts'),
        apiFetch<R<Lead[]>>('/admin/leads'),
        apiFetch<R<Staff[]>>('/admin/staff'),
      ]);

      setItems(activitiesR.data);
      setOrganizations(orgsR.data);
      setContacts(contactsR.data);
      setLeads(leadsR.data);
      setStaff(staffR.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load activities.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.organization_name?.toLowerCase().includes(q) ||
        item.lead_title?.toLowerCase().includes(q) ||
        `${item.assignee_first_name ?? ''} ${item.assignee_last_name ?? ''}`
          .toLowerCase()
          .includes(q);

      return (
        matchesQuery &&
        (!typeFilter || item.activity_type === typeFilter) &&
        (!statusFilter || item.status === statusFilter)
      );
    });
  }, [items, query, typeFilter, statusFilter]);

  const now = Date.now();
  const stats = {
    total: items.length,
    upcoming: items.filter(
      (x) => x.status === 'PLANNED' && x.scheduled_at && new Date(x.scheduled_at).getTime() >= now,
    ).length,
    completed: items.filter((x) => x.status === 'COMPLETED').length,
    overdue: items.filter(
      (x) =>
        !['COMPLETED','CANCELLED'].includes(x.status) &&
        x.scheduled_at &&
        new Date(x.scheduled_at).getTime() < now,
    ).length,
  };

  function startCreate() {
    setEditing(null);
    setOpen(true);
  }

  function startEdit(activity: Activity) {
    setEditing(activity);
    setOpen(true);
  }

  async function remove(activity: Activity) {
    if (!window.confirm(`Delete "${activity.title}"?`)) return;
    try {
      await apiFetch(`/admin/activities/${activity.id}`, { method: 'DELETE' });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete activity.');
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#765078]">CRM WORKSPACE</p>
          <h1 className="mt-1 text-3xl font-semibold text-[#281e29]">Activities</h1>
          <p className="mt-2 text-sm text-[#817681]">
            Calls, meetings, emails, follow-ups and relationship activity across Planorahub.
          </p>
        </div>

        <button
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4a1b51]"
        >
          <Plus size={16} />
          Log activity
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Total activities" value={stats.total} icon={<MessageSquareText size={18}/>} />
        <Stat title="Upcoming" value={stats.upcoming} icon={<CalendarClock size={18}/>} />
        <Stat title="Completed" value={stats.completed} icon={<CheckCircle2 size={18}/>} />
        <Stat title="Overdue" value={stats.overdue} icon={<Clock3 size={18}/>} />
      </div>

      <section className="mt-6 rounded-2xl border border-[#e9e2ea] bg-white">
        <div className="flex flex-wrap gap-3 border-b border-[#eee8ef] p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#918693]" size={16}/>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search activities..."
              className="w-full rounded-xl border border-[#e5dde6] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#765078]"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-[#e5dde6] px-3 py-2.5 text-sm"
          >
            <option value="">All types</option>
            {TYPES.map((x) => <option key={x} value={x}>{friendly(x)}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[#e5dde6] px-3 py-2.5 text-sm"
          >
            <option value="">All statuses</option>
            {STATUSES.map((x) => <option key={x} value={x}>{friendly(x)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-[#817681]">Loading activities...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-semibold">No activities found</p>
            <p className="mt-1 text-sm text-[#918693]">Log the first customer or team activity.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0eaf1]">
            {filtered.map((activity) => (
              <div key={activity.id} className="flex flex-wrap items-center gap-4 p-4 hover:bg-[#fcfafc]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4eff6] text-[#765078]">
                  {typeIcon(activity.activity_type)}
                </div>

                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[#342936]">{activity.title}</p>
                    <span className="rounded-full bg-[#f4eff6] px-2 py-0.5 text-[11px] font-semibold text-[#765078]">
                      {friendly(activity.activity_type)}
                    </span>
                    <Status value={activity.status}/>
                  </div>

                  <p className="mt-1 text-xs text-[#817681]">
                    {activity.organization_name ?? 'No organization'}
                    {activity.lead_title ? ` · ${activity.lead_title}` : ''}
                  </p>
                </div>

                <div className="min-w-[150px]">
                  <p className="text-xs text-[#918693]">Assigned to</p>
                  <p className="mt-1 text-sm font-medium">
                    {activity.assignee_first_name
                      ? `${activity.assignee_first_name} ${activity.assignee_last_name ?? ''}`.trim()
                      : 'Unassigned'}
                  </p>
                </div>

                <div className="min-w-[170px]">
                  <p className="text-xs text-[#918693]">Scheduled</p>
                  <p className="mt-1 text-sm font-medium">
                    {activity.scheduled_at
                      ? new Date(activity.scheduled_at).toLocaleString()
                      : 'Not scheduled'}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(activity)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-[#765078] hover:bg-[#f4eff6]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void remove(activity)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {open ? (
        <ActivityDrawer
          activity={editing}
          organizations={organizations}
          contacts={contacts}
          leads={leads}
          staff={staff}
          saving={saving}
          onClose={() => setOpen(false)}
          onSave={async (payload) => {
            try {
              setSaving(true);
              setError(null);
              await apiFetch(
                editing ? `/admin/activities/${editing.id}` : '/admin/activities',
                {
                  method: editing ? 'PATCH' : 'POST',
                  body: JSON.stringify(payload),
                },
              );
              setOpen(false);
              await load();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Unable to save activity.');
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ActivityDrawer({
  activity,
  organizations,
  contacts,
  leads,
  staff,
  saving,
  onClose,
  onSave,
}: {
  activity: Activity | null;
  organizations: Organization[];
  contacts: Contact[];
  leads: Lead[];
  staff: Staff[];
  saving: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(activity?.title ?? '');
  const [activityType, setActivityType] = useState(activity?.activity_type ?? 'FOLLOW_UP');
  const [status, setStatus] = useState(activity?.status ?? 'PLANNED');
  const [description, setDescription] = useState(activity?.description ?? '');
  const [outcome, setOutcome] = useState(activity?.outcome ?? '');
  const [organizationId, setOrganizationId] = useState(activity?.organization_id ?? '');
  const [contactId, setContactId] = useState(activity?.contact_id ?? '');
  const [leadId, setLeadId] = useState(activity?.lead_id ?? '');
  const [assignedToId, setAssignedToId] = useState(activity?.assigned_to_id ?? '');
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(activity?.scheduled_at));
  const [nextFollowUpAt, setNextFollowUpAt] = useState(toLocalInput(activity?.next_follow_up_at));

  const filteredContacts = contacts.filter(
    (x) => !organizationId || x.organization_id === organizationId,
  );
  const filteredLeads = leads.filter(
    (x) => !organizationId || x.organization_id === organizationId,
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    await onSave({
      title,
      activityType,
      status,
      description: description || null,
      outcome: outcome || null,
      organizationId: organizationId || null,
      contactId: contactId || null,
      leadId: leadId || null,
      assignedToId: assignedToId || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button aria-label="Close" className="absolute inset-0" onClick={onClose}/>
      <div className="relative h-full w-full max-w-[560px] overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#765078]">CRM ACTIVITY</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {activity ? 'Edit activity' : 'Log activity'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-[#f4eff6]">
            <X size={18}/>
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <Field label="Title">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="e.g. Follow up on revised proposal"/>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <select value={activityType} onChange={(e) => setActivityType(e.target.value)} className="input">
                {TYPES.map((x) => <option key={x} value={x}>{friendly(x)}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
                {STATUSES.map((x) => <option key={x} value={x}>{friendly(x)}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Organization">
            <select
              value={organizationId}
              onChange={(e) => {
                setOrganizationId(e.target.value);
                setContactId('');
                setLeadId('');
              }}
              className="input"
            >
              <option value="">No organization</option>
              {organizations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact">
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="input">
                <option value="">No contact</option>
                {filteredContacts.map((x) => (
                  <option key={x.id} value={x.id}>{x.first_name} {x.last_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Lead">
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="input">
                <option value="">No lead</option>
                {filteredLeads.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Assigned staff">
            <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="input">
              <option value="">Unassigned</option>
              {staff.map((x) => (
                <option key={x.id} value={x.id}>{x.first_name} {x.last_name} — {x.email}</option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scheduled">
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="input"/>
            </Field>
            <Field label="Next follow-up">
              <input type="datetime-local" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} className="input"/>
            </Field>
          </div>

          <Field label="Description / notes">
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="input resize-none" placeholder="What happened or what needs to happen?"/>
          </Field>

          <Field label="Outcome">
            <textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} className="input resize-none" placeholder="Result, decision or next step"/>
          </Field>

          <button
            disabled={saving}
            className="w-full rounded-xl bg-[#36133b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : activity ? 'Save changes' : 'Log activity'}
          </button>
        </form>

        <style jsx>{`
          :global(.input) {
            width: 100%;
            border: 1px solid #e5dde6;
            border-radius: 0.75rem;
            padding: 0.7rem 0.8rem;
            font-size: 0.875rem;
            outline: none;
          }
          :global(.input:focus) {
            border-color: #765078;
          }
        `}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#817681]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e9e2ea] bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#817681]">{title}</p>
        <div className="rounded-lg bg-[#f4eff6] p-2 text-[#765078]">{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const cls =
    value === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'CANCELLED'
        ? 'bg-zinc-100 text-zinc-600'
        : value === 'IN_PROGRESS'
          ? 'bg-blue-50 text-blue-700'
          : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{friendly(value)}</span>;
}

function friendly(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
}

function typeIcon(type: string) {
  if (type === 'CALL') return <Phone size={17}/>;
  if (type === 'MEETING') return <UsersRound size={17}/>;
  if (type === 'EMAIL') return <Mail size={17}/>;
  if (type === 'NOTE') return <MessageSquareText size={17}/>;
  return <CalendarClock size={17}/>;
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
