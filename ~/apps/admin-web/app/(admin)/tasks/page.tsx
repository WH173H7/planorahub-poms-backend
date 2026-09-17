'use client';

import {
  CheckCircle2,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type Status =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'AWAITING_RESPONSE'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED';

type Priority =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'URGENT';

type Task = {
  id: string;
  title: string;
  description: string | null;
  organization_id: string | null;
  organization_name: string | null;
  lead_id: string | null;
  lead_title: string | null;
  contact_id: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  assigned_to_id: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  status: Status;
  priority: Priority;
  start_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  accepted_by_id: string | null;
  accepted_by_first_name: string | null;
  accepted_by_last_name: string | null;
  created_at: string;
};

type Org = {
  id: string;
  name: string;
  status: string;
};

type Lead = {
  id: string;
  title: string;
  organization_id: string;
  stage: string;
};

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  organization_id: string;
};

type Staff = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
};

type R<T> = {
  success: boolean;
  data: T;
};

const statuses: Array<{
  value: Status;
  label: string;
}> = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'AWAITING_RESPONSE', label: 'Awaiting response' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function TasksPage() {
  const router = useRouter();

  const [tasks, setTasks] =
    useState<Task[]>([]);
  const [organizations, setOrganizations] =
    useState<Org[]>([]);
  const [leads, setLeads] =
    useState<Lead[]>([]);
  const [contacts, setContacts] =
    useState<Contact[]>([]);
  const [staff, setStaff] =
    useState<Staff[]>([]);
  const [search, setSearch] =
    useState('');
  const [filter, setFilter] =
    useState<'ALL' | Status>('ALL');
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);
  const [drawer, setDrawer] =
    useState<{ task?: Task } | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [t, o, l, c, s] =
        await Promise.all([
          apiFetch<R<Task[]>>('/admin/tasks'),
          apiFetch<R<Org[]>>('/admin/organizations'),
          apiFetch<R<Lead[]>>('/admin/leads'),
          apiFetch<R<Contact[]>>('/admin/contacts'),
          apiFetch<R<Staff[]>>('/admin/staff'),
        ]);

      setTasks(t.data);
      setOrganizations(o.data);
      setLeads(l.data);
      setContacts(c.data);
      setStaff(s.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load tasks.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q =
      search.trim().toLowerCase();

    return tasks.filter((task) =>
      (
        filter === 'ALL' ||
        task.status === filter
      ) &&
      (
        !q ||
        [
          task.title,
          task.organization_name,
          task.lead_title,
          task.assignee_first_name,
          task.assignee_last_name,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(q),
          )
      ),
    );
  }, [tasks, search, filter]);

  const overdue =
    tasks.filter(
      (task) =>
        task.due_at &&
        new Date(task.due_at) <
          new Date() &&
        ![
          'COMPLETED',
          'CANCELLED',
        ].includes(task.status),
    ).length;

  const completed =
    tasks.filter(
      (task) =>
        task.status === 'COMPLETED',
    ).length;

  const active =
    tasks.filter(
      (task) =>
        ![
          'COMPLETED',
          'CANCELLED',
        ].includes(task.status),
    ).length;

  async function deleteTask(task: Task) {
    const confirmed = window.confirm(
      `Permanently delete "${task.title}"? This is intended for accidental/test tasks and cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      await apiFetch(`/admin/tasks/${task.id}`, {
        method: 'DELETE',
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to delete task.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-[1450px]">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#7a6f7b]">
            Work
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Tasks
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#726874]">
            Assign work to staff and connect it to an organization, prospect or contact.
          </p>
        </div>

        <button
          onClick={() =>
            setDrawer({})
          }
          className="inline-flex items-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={17} />
          Create task
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          label="Total tasks"
          value={tasks.length}
        />
        <Card
          label="Active work"
          value={active}
        />
        <Card
          label="Completed"
          value={completed}
        />
        <Card
          label="Overdue"
          value={overdue}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e9e2ea] bg-white">
        <div className="flex flex-wrap gap-3 border-b border-[#eee8ef] p-4">
          <div className="relative min-w-[250px] flex-1">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#958a96]"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search task, organization, prospect or assignee..."
              className="h-10 w-full rounded-lg border border-[#e3dae4] pl-10 pr-3 text-sm outline-none focus:border-[#765078]"
            />
          </div>

          <select
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target.value as
                  | 'ALL'
                  | Status,
              )
            }
            className="h-10 rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"
          >
            <option value="ALL">
              All statuses
            </option>

            {statuses.map((status) => (
              <option
                key={status.value}
                value={status.value}
              >
                {status.label}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[340px] items-center justify-center text-sm text-[#817681]">
            Loading tasks...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
            <CheckCircle2 className="text-[#36133b]" />
            <p className="mt-4 font-semibold">
              No tasks found
            </p>
            <p className="mt-1 text-sm text-[#817681]">
              Create the first operational task.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left">
              <thead className="bg-[#faf7fb]">
                <tr className="text-xs uppercase tracking-wide text-[#8b818c]">
                  <th className="px-5 py-3">
                    Task
                  </th>
                  <th className="px-5 py-3">
                    Related to
                  </th>
                  <th className="px-5 py-3">
                    Assignee
                  </th>
                  <th className="px-5 py-3">
                    Priority
                  </th>
                  <th className="px-5 py-3">
                    Status
                  </th>
                  <th className="px-5 py-3">
                    Staff progress
                  </th>
                  <th className="px-5 py-3">
                    Due
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>

              <tbody className="divide-y divide-[#eee8ef]">
                {filtered.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() =>
                      router.push(
                        `/tasks/${task.id}`,
                      )
                    }
                    className="cursor-pointer transition hover:bg-[#f8f3f9]"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold">
                        {task.title}
                      </p>
                      <p className="mt-1 max-w-[320px] truncate text-xs text-[#817681]">
                        {task.description ??
                          'No description'}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {task.organization_name ??
                        task.lead_title ??
                        'General task'}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {task.assignee_first_name
                        ? `${task.assignee_first_name} ${task.assignee_last_name ?? ''}`.trim()
                        : 'Unassigned'}
                    </td>

                    <td className="px-5 py-4">
                      <Badge
                        text={
                          task.priority
                        }
                      />
                    </td>

                    <td className="px-5 py-4">
                      <Badge
                        text={
                          statuses.find(
                            (status) =>
                              status.value ===
                              task.status,
                          )?.label ??
                          task.status
                        }
                      />
                    </td>

                    <td className="px-5 py-4">
                      <LifecycleBadge task={task} />
                    </td>

                    <td className="px-5 py-4 text-sm text-[#817681]">
                      {task.due_at
                        ? new Date(
                            task.due_at,
                          ).toLocaleString()
                        : '—'}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setDrawer({ task });
                          }}
                          className="rounded-lg p-2 text-[#726874] hover:bg-[#f4eff6] hover:text-[#36133b]"
                          aria-label={`Edit ${task.title}`}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteTask(task);
                          }}
                          className="rounded-lg p-2 text-[#817681] hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${task.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
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
        <TaskDrawer
          task={drawer.task}
          organizations={
            organizations
          }
          leads={leads}
          contacts={contacts}
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

function TaskDrawer({
  task,
  organizations,
  leads,
  contacts,
  staff,
  onClose,
  onSaved,
}: {
  task?: Task;
  organizations: Org[];
  leads: Lead[];
  contacts: Contact[];
  staff: Staff[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] =
    useState(task?.title ?? '');
  const [
    description,
    setDescription,
  ] = useState(
    task?.description ?? '',
  );
  const [
    organizationId,
    setOrganizationId,
  ] = useState(
    task?.organization_id ?? '',
  );
  const [leadId, setLeadId] =
    useState(task?.lead_id ?? '');
  const [contactId, setContactId] =
    useState(
      task?.contact_id ?? '',
    );
  const [
    assigneeId,
    setAssigneeId,
  ] = useState(
    task?.assigned_to_id ?? '',
  );
  const [status, setStatus] =
    useState<Status>(
      task?.status ?? 'TODO',
    );
  const [priority, setPriority] =
    useState<Priority>(
      task?.priority ?? 'MEDIUM',
    );
  const [dueAt, setDueAt] =
    useState(
      task?.due_at
        ? localInput(
            task.due_at,
          )
        : '',
    );
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [pendingFiles, setPendingFiles] =
    useState<File[]>([]);

  const orgLeads =
    organizationId
      ? leads.filter(
          (lead) =>
            lead.organization_id ===
            organizationId,
        )
      : [];

  const orgContacts =
    organizationId
      ? contacts.filter(
          (contact) =>
            contact.organization_id ===
            organizationId,
        )
      : [];

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);

      const saved = await apiFetch<R<Task>>(
        task
          ? `/admin/tasks/${task.id}`
          : '/admin/tasks',
        {
          method: task
            ? 'PATCH'
            : 'POST',
          body: JSON.stringify({
            title:
              title.trim(),
            description:
              description.trim() ||
              null,
            organizationId:
              organizationId ||
              null,
            leadId:
              leadId || null,
            contactId:
              contactId || null,
            assignedToId:
              assigneeId || null,
            status,
            priority,
            dueAt: dueAt
              ? new Date(
                  dueAt,
                ).toISOString()
              : null,
          }),
        },
      );

      const savedTaskId =
        task?.id ?? saved.data.id;

      for (const file of pendingFiles) {
        const formData = new FormData();
        formData.append('file', file);

        await apiFetch(
          `/admin/tasks/${savedTaskId}/attachments`,
          {
            method: 'POST',
            body: formData,
          },
        );
      }

      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save task.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0 bg-black/25"
      />

      <motion.div
        initial={{
          x: 35,
          opacity: 0,
        }}
        animate={{
          x: 0,
          opacity: 1,
        }}
        className="absolute inset-y-0 right-0 w-full max-w-[680px] overflow-y-auto overscroll-contain bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 border-b border-[#eee8ef] bg-white px-6 py-5">
          <h2 className="text-xl font-semibold">
            {task
              ? 'Edit task'
              : 'Create task'}
          </h2>

          <p className="mt-1 text-sm text-[#817681]">
            Assign the work, relationship, priority and deadline.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-6 p-6 pb-40"
        >
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <Field
            label="Task title"
            value={title}
            onChange={setTitle}
          />

          <label className="block">
            <span className="text-sm font-semibold">
              Description
            </span>

            <textarea
              rows={5}
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value,
                )
              }
              className="mt-2 w-full resize-none rounded-lg border border-[#e3dae4] p-3 text-sm outline-none focus:border-[#765078]"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Organization"
              value={
                organizationId
              }
              onChange={(value) => {
                setOrganizationId(
                  value,
                );
                setLeadId('');
                setContactId('');
              }}
              optional
              options={organizations
                .filter(
                  (organization) =>
                    organization.status !==
                    'ARCHIVED',
                )
                .map(
                  (organization) => ({
                    value:
                      organization.id,
                    label:
                      organization.name,
                  }),
                )}
            />

            <Select
              label="Prospect"
              value={leadId}
              onChange={setLeadId}
              optional
              disabled={!organizationId}
              emptyLabel={
                organizationId
                  ? 'None'
                  : 'Select organization first'
              }
              options={orgLeads.map(
                (lead) => ({
                  value: lead.id,
                  label: lead.title,
                }),
              )}
            />

            <Select
              label="Contact"
              value={contactId}
              onChange={setContactId}
              optional
              disabled={!organizationId}
              emptyLabel={
                organizationId
                  ? 'None'
                  : 'Select organization first'
              }
              options={orgContacts.map(
                (contact) => ({
                  value: contact.id,
                  label: `${contact.first_name} ${contact.last_name}`,
                }),
              )}
            />

            <Select
              label="Assigned staff"
              value={assigneeId}
              onChange={
                setAssigneeId
              }
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

            <Select
              label="Priority"
              value={priority}
              onChange={(value) =>
                setPriority(
                  value as Priority,
                )
              }
              options={[
                'LOW',
                'MEDIUM',
                'HIGH',
                'URGENT',
              ].map((value) => ({
                value,
                label:
                  value[0] +
                  value
                    .slice(1)
                    .toLowerCase(),
              }))}
            />

            <Select
              label="Status"
              value={status}
              onChange={(value) =>
                setStatus(
                  value as Status,
                )
              }
              options={statuses}
            />

            <div className="sm:col-span-2">
              <Field
                label="Due date & time"
                value={dueAt}
                onChange={setDueAt}
                type="datetime-local"
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#e8e0e9] bg-[#fcfafc] p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[#f4eff6] p-2 text-[#36133b]">
                <Paperclip size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  Task files
                </p>
                <p className="mt-1 text-xs leading-5 text-[#817681]">
                  Add supporting documents, screenshots, briefs or spreadsheets for the assigned staff. Maximum 10 MB per file.
                </p>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#cfc2d1] bg-white px-4 py-4 text-sm font-semibold text-[#36133b] transition hover:bg-[#f8f3f9]">
              <Paperclip size={16} />
              Choose files
              <input
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(event) => {
                  const selected = Array.from(
                    event.target.files ?? [],
                  );

                  const tooLarge = selected.find(
                    (file) =>
                      file.size >
                      10 * 1024 * 1024,
                  );

                  if (tooLarge) {
                    setError(
                      `${tooLarge.name} is larger than 10 MB.`,
                    );
                    event.target.value = '';
                    return;
                  }

                  setError(null);
                  setPendingFiles((current) => [
                    ...current,
                    ...selected.filter(
                      (candidate) =>
                        !current.some(
                          (existing) =>
                            existing.name ===
                              candidate.name &&
                            existing.size ===
                              candidate.size,
                        ),
                    ),
                  ]);
                  event.target.value = '';
                }}
              />
            </label>

            {pendingFiles.length > 0 ? (
              <div className="mt-3 space-y-2">
                {pendingFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center gap-3 rounded-lg border border-[#ece5ed] bg-white px-3 py-2.5"
                  >
                    <FileText
                      size={17}
                      className="shrink-0 text-[#765078]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {file.name}
                      </p>
                      <p className="text-xs text-[#8a7f8b]">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingFiles((current) =>
                          current.filter(
                            (_, fileIndex) =>
                              fileIndex !== index,
                          ),
                        )
                      }
                      className="rounded-lg p-2 text-[#817681] hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

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
                ? pendingFiles.length > 0
                  ? 'Saving & uploading...'
                  : 'Saving...'
                : task
                  ? 'Save changes'
                  : 'Create task'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function LifecycleBadge({ task }: { task: Task }) {
  let label = 'Unassigned';

  if (task.assigned_to_id) {
    label = 'Awaiting acceptance';
  }

  if (task.accepted_at) {
    label = 'Accepted';
  }

  if (task.started_at || task.status === 'IN_PROGRESS') {
    label = 'Work started';
  }

  if (task.status === 'COMPLETED') {
    label = 'Completed';
  }

  if (task.status === 'CANCELLED') {
    label = 'Cancelled';
  }

  return (
    <span className="inline-flex rounded-full bg-[#f7f3f8] px-2.5 py-1 text-xs font-semibold text-[#5f4862]">
      {label}
    </span>
  );
}

function Card({
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

function Badge({
  text,
}: {
  text: string;
}) {
  return (
    <span className="rounded-full bg-[#f4eff6] px-2.5 py-1 text-xs font-semibold text-[#36133b]">
      {text}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        className="mt-2 h-10 w-full rounded-lg border border-[#e3dae4] px-3 text-sm outline-none focus:border-[#765078]"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  optional = false,
  disabled = false,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  optional?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
      </span>

      <select
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        className="mt-2 h-10 w-full rounded-lg border border-[#e3dae4] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-[#f7f4f7] disabled:text-[#9a909b]"
      >
        <option value="">
          {emptyLabel ??
            (
              optional
                ? 'None'
                : 'Select'
            )}
        </option>

        {options.map(
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {
                option.label
              }
            </option>
          ),
        )}
      </select>
    </label>
  );
}

function localInput(
  value: string,
) {
  const date =
    new Date(value);

  const local =
    new Date(
      date.getTime() -
        date.getTimezoneOffset() *
          60000,
    );

  return local
    .toISOString()
    .slice(0, 16);
}


function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
