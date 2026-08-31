'use client';

import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import {
  FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useParams,
  useRouter,
} from 'next/navigation';

import { apiFetch } from '@/lib/api';

type Event = {
  id: string;
  event_type: string;
  message: string | null;
  parent_event_id: string | null;
  actor_first_name: string | null;
  actor_last_name: string | null;
  created_at: string;
};

type Attachment = {
  id: string;
  task_id: string;
  event_id: string | null;
  uploaded_by_id: string | null;
  file_name: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  uploader_first_name: string | null;
  uploader_last_name: string | null;
};

type LeadAssignmentBatch = {
  id: string;
  title: string;
  instructions: string;
  assigned_to_id: string;
  assigned_by_id: string | null;
  priority: string;
  due_at: string;
  task_id: string | null;
  created_at: string;
  items: Array<{
    id: string;
    lead_id: string;
    organization_id: string;
    organization_name: string;
    stage: string;
    pursuit_progress: number;
    priority: string;
    previous_owner_id: string | null;
  }>;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  organization_name: string | null;
  lead_title: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  assigned_to_id: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  accepted_by_id: string | null;
  accepted_by_first_name: string | null;
  accepted_by_last_name: string | null;
  events: Event[];
  attachments: Attachment[];
  lead_assignment_batch: LeadAssignmentBatch | null;
};

type R<T> = {
  success: boolean;
  data: T;
};

type DownloadResponse = {
  attachmentId: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  expiresInSeconds: number;
  signedUrl: string;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
].join(',');

export default function TaskDetailPage() {
  const { taskId } =
    useParams<{ taskId: string }>();

  const router = useRouter();

  const [task, setTask] =
    useState<Task | null>(null);

  const [comment, setComment] =
    useState('');

  const [replyTo, setReplyTo] =
    useState<Event | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [uploading, setUploading] =
    useState(false);

  const [downloadingId, setDownloadingId] =
    useState<string | null>(null);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const response =
        await apiFetch<R<Task>>(
          `/admin/tasks/${taskId}`,
        );

      setTask(response.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load task.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [taskId]);

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!comment.trim()) {
      return;
    }

    try {
      setError(null);

      await apiFetch(
        `/admin/tasks/${taskId}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: comment.trim(),
            parentEventId:
              replyTo?.id ?? null,
          }),
        },
      );

      setComment('');
      setReplyTo(null);

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to add update.',
      );
    }
  }

  function chooseFile(
    file: File | undefined,
  ) {
    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError(
        'The selected file is larger than 10 MB.',
      );
      return;
    }

    setError(null);
    setSelectedFile(file);
  }

  async function uploadAttachment() {
    if (!selectedFile) {
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData =
        new FormData();

      formData.append(
        'file',
        selectedFile,
      );

      await apiFetch(
        `/admin/tasks/${taskId}/attachments`,
        {
          method: 'POST',
          body: formData,
        },
      );

      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to upload attachment.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function downloadAttachment(
    attachment: Attachment,
  ) {
    try {
      setDownloadingId(
        attachment.id,
      );
      setError(null);

      const response =
        await apiFetch<
          R<DownloadResponse>
        >(
          `/admin/tasks/${taskId}/attachments/${attachment.id}/download`,
        );

      window.open(
        response.data.signedUrl,
        '_blank',
        'noopener,noreferrer',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to download attachment.',
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function deleteAttachment(
    attachment: Attachment,
  ) {
    const confirmed =
      window.confirm(
        `Delete "${attachment.file_name}" from this task?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(attachment.id);
      setError(null);

      await apiFetch(
        `/admin/tasks/${taskId}/attachments/${attachment.id}`,
        {
          method: 'DELETE',
        },
      );

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to delete attachment.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  const topEvents =
    useMemo(
      () =>
        task?.events.filter(
          (event) =>
            !event.parent_event_id,
        ) ?? [],
      [task],
    );

  const replies =
    useMemo(() => {
      const map =
        new Map<string, Event[]>();

      for (const event of
        task?.events ?? []) {
        if (!event.parent_event_id) {
          continue;
        }

        map.set(
          event.parent_event_id,
          [
            ...(map.get(
              event.parent_event_id,
            ) ?? []),
            event,
          ],
        );
      }

      return map;
    }, [task]);

  const attachmentsByEvent =
    useMemo(() => {
      const map =
        new Map<
          string,
          Attachment[]
        >();

      for (const attachment of
        task?.attachments ?? []) {
        if (!attachment.event_id) {
          continue;
        }

        map.set(
          attachment.event_id,
          [
            ...(map.get(
              attachment.event_id,
            ) ?? []),
            attachment,
          ],
        );
      }

      return map;
    }, [task]);

  if (loading && !task) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-[#817681]">
        <Loader2
          size={16}
          className="animate-spin"
        />
        Loading task...
      </div>
    );
  }

  if (!task) {
    return (
      <div>
        <button
          onClick={() =>
            router.push('/tasks')
          }
          className="flex items-center gap-2 text-sm font-semibold text-[#36133b]"
        >
          <ArrowLeft size={16} />
          Tasks
        </button>

        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? 'Task not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <button
        onClick={() =>
          router.push('/tasks')
        }
        className="mb-5 flex items-center gap-2 text-sm font-semibold text-[#6f6170] transition hover:text-[#36133b]"
      >
        <ArrowLeft size={16} />
        Tasks
      </button>

      {error ? (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{error}</span>

          <button
            type="button"
            onClick={() =>
              setError(null)
            }
            className="shrink-0"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[#f4eff6] px-2.5 py-1 text-xs font-semibold text-[#36133b]">
                {task.status.replaceAll('_', ' ')}
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                {task.priority}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-[#261c27]">{task.title}</h1>
            <p className="mt-1 text-sm text-[#918693]">
              Created {new Date(task.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e7dee8] bg-[#fcfafc] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#765078]">Task instructions</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#433945]">
            {task.description?.trim() || 'No instructions were added to this task.'}
          </p>
        </div>

        <div className="mt-6 grid gap-x-6 gap-y-5 border-t border-[#eee8ef] pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <Meta icon={<Building2 size={16} />} label="Organization" value={task.organization_name ?? 'General task'} />
          <Meta icon={<FileText size={16} />} label="Related prospect" value={task.lead_title ?? 'No prospect linked'} />
          <Meta
            icon={<UserRound size={16} />}
            label="Related contact"
            value={
              task.contact_first_name
                ? `${task.contact_first_name} ${task.contact_last_name ?? ''}`.trim()
                : 'No contact linked'
            }
          />
          <Meta
            icon={<UserRound size={16} />}
            label="Assigned to"
            value={
              task.assignee_first_name
                ? `${task.assignee_first_name} ${task.assignee_last_name ?? ''}`.trim()
                : 'Unassigned'
            }
          />
          <Meta icon={<CalendarClock size={16} />} label="Priority" value={friendly(task.priority)} />
          <Meta
            icon={<CalendarClock size={16} />}
            label="Due"
            value={task.due_at ? new Date(task.due_at).toLocaleString() : 'No deadline'}
          />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[#e9e2ea] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#261c27]">Attachments</h2>
            <p className="mt-1 text-sm text-[#817681]">
              Files supplied with this task are kept here so the assignee can find the work material immediately.
            </p>
          </div>
          <span className="rounded-full bg-[#f4eff6] px-3 py-1 text-xs font-semibold text-[#36133b]">
            {task.attachments.length} {task.attachments.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        {task.attachments.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {task.attachments.map((attachment) => (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                downloading={downloadingId === attachment.id}
                deleting={deletingId === attachment.id}
                onDownload={() => void downloadAttachment(attachment)}
                onDelete={() => void deleteAttachment(attachment)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-[#ddd3df] bg-[#fcfafc] p-6 text-center">
            <Paperclip className="mx-auto text-[#918693]" size={20} />
            <p className="mt-2 text-sm font-semibold text-[#514752]">No files attached</p>
            <p className="mt-1 text-xs text-[#918693]">Use the upload panel below to add supporting documents.</p>
          </div>
        )}
      </section>

      {task.lead_assignment_batch ? (
        <section className="mt-6 rounded-2xl border border-[#e9e2ea] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#765078]">Lead assignment</p>
              <h2 className="mt-2 text-lg font-semibold text-[#261c27]">
                {task.lead_assignment_batch.items.length} organization lead{task.lead_assignment_batch.items.length === 1 ? '' : 's'} in this task
              </h2>
              <p className="mt-1 text-sm text-[#817681]">Each lead keeps its own pursuit stage and progress while this task carries management's shared brief.</p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-[#eee8ef]">
            <div className="grid grid-cols-[1fr_130px_150px] bg-[#faf7fb] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#8b818c]">
              <span>Organization</span><span>Status</span><span>Progress</span>
            </div>
            <div className="divide-y divide-[#eee8ef]">
              {task.lead_assignment_batch.items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_130px_150px] items-center gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-[#302631]">{item.organization_name}</p>
                    <p className="mt-1 text-xs text-[#918693]">Priority: {item.priority}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#69456d]">{friendly(item.stage)}</span>
                  <div>
                    <div className="mb-1 text-xs text-[#817681]">{item.pursuit_progress ?? 0}%</div>
                    <div className="h-1.5 rounded-full bg-[#eee7ef]">
                      <div className="h-1.5 rounded-full bg-[#765078]" style={{ width: `${item.pursuit_progress ?? 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[#e9e2ea] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#261c27]">Staff workflow</h2>
            <p className="mt-1 text-sm text-[#817681]">Track what is expected next without acting on behalf of the assigned staff member.</p>
          </div>
          {!task.assigned_to_id ? (
            <LifecyclePill label="Unassigned" />
          ) : task.status === 'COMPLETED' ? (
            <LifecyclePill label="Completed" />
          ) : task.status === 'CANCELLED' ? (
            <LifecyclePill label="Cancelled" />
          ) : !task.accepted_at ? (
            <LifecyclePill label="Awaiting acceptance" />
          ) : !task.started_at && task.status !== 'IN_PROGRESS' ? (
            <LifecyclePill label="Accepted" />
          ) : (
            <LifecyclePill label="Work started" />
          )}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <WorkflowStep number="1" title="Assigned" active={Boolean(task.assigned_to_id)} detail={task.assignee_first_name ? `${task.assignee_first_name} ${task.assignee_last_name ?? ''}`.trim() : 'Waiting for assignee'} />
          <WorkflowStep number="2" title="Accepted" active={Boolean(task.accepted_at)} detail={task.accepted_at ? new Date(task.accepted_at).toLocaleString() : 'Staff must accept'} />
          <WorkflowStep number="3" title="Work started" active={Boolean(task.started_at) || task.status === 'IN_PROGRESS' || task.status === 'COMPLETED'} detail={task.started_at ? new Date(task.started_at).toLocaleString() : 'Starts after acceptance'} />
          <WorkflowStep number="4" title="Completed" active={task.status === 'COMPLETED'} detail={task.completed_at ? new Date(task.completed_at).toLocaleString() : 'Waiting for completion'} />
        </div>

        <div className="mt-5 rounded-xl bg-[#f8f4f9] px-4 py-3 text-sm text-[#5f5361]">
          <span className="font-semibold text-[#36133b]">What happens next: </span>
          {nextStep(task)}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
          <h2 className="text-lg font-semibold text-[#261c27]">
            Progress timeline
          </h2>

          <p className="mt-1 text-sm text-[#817681]">
            Every meaningful task change,
            file and discussion appears
            here.
          </p>

          <div className="mt-7">
            {topEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#ddd3df] bg-[#fcfafc] p-8 text-center">
                <p className="text-sm font-semibold text-[#514752]">
                  No progress events yet
                </p>
                <p className="mt-1 text-xs text-[#918693]">
                  Task updates, files and
                  discussions will appear
                  here.
                </p>
              </div>
            ) : (
              topEvents.map(
                (event, index) => {
                  const eventAttachments =
                    attachmentsByEvent.get(
                      event.id,
                    ) ?? [];

                  return (
                    <div
                      key={event.id}
                      className="relative flex gap-4 pb-7"
                    >
                      {index <
                      topEvents.length -
                        1 ? (
                        <div className="absolute left-[7px] top-5 h-full border-l-2 border-dashed border-[#ddd3df]" />
                      ) : null}

                      <div className="relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-4 border-[#f4eff6] bg-[#36133b]" />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {friendly(
                              event.event_type,
                            )}
                          </p>

                          <p className="text-xs text-[#918693]">
                            {new Date(
                              event.created_at,
                            ).toLocaleString()}
                          </p>
                        </div>

                        <p className="mt-1 text-xs text-[#817681]">
                          {actor(event)}
                        </p>

                        {event.message ? (
                          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[#faf7fb] p-3 text-sm leading-6 text-[#514752]">
                            {
                              event.message
                            }
                          </p>
                        ) : null}

                        {eventAttachments.length >
                        0 ? (
                          <div className="mt-3 space-y-2">
                            {eventAttachments.map(
                              (
                                attachment,
                              ) => (
                                <AttachmentCard
                                  key={
                                    attachment.id
                                  }
                                  attachment={
                                    attachment
                                  }
                                  compact
                                  downloading={
                                    downloadingId ===
                                    attachment.id
                                  }
                                  deleting={
                                    deletingId ===
                                    attachment.id
                                  }
                                  onDownload={() =>
                                    void downloadAttachment(
                                      attachment,
                                    )
                                  }
                                  onDelete={() =>
                                    void deleteAttachment(
                                      attachment,
                                    )
                                  }
                                />
                              ),
                            )}
                          </div>
                        ) : null}

                        {(
                          replies.get(
                            event.id,
                          ) ?? []
                        ).map((reply) => (
                          <div
                            key={
                              reply.id
                            }
                            className="ml-5 mt-2 rounded-xl border border-[#eee8ef] p-3"
                          >
                            <p className="text-xs font-semibold">
                              {actor(
                                reply,
                              )}{' '}
                              ·{' '}
                              {new Date(
                                reply.created_at,
                              ).toLocaleString()}
                            </p>

                            <p className="mt-1 text-sm text-[#5d535e]">
                              {
                                reply.message
                              }
                            </p>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            setReplyTo(
                              event,
                            )
                          }
                          className="mt-2 text-xs font-semibold text-[#765078] transition hover:text-[#36133b]"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>
        </section>

        <aside className="h-fit space-y-5 lg:sticky lg:top-[100px]">
          <section className="rounded-2xl border border-[#e9e2ea] bg-white p-5">
            <h2 className="font-semibold text-[#261c27]">
              {replyTo
                ? 'Reply to update'
                : 'Add progress update'}
            </h2>

            {replyTo ? (
              <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-[#faf7fb] p-3 text-xs text-[#726874]">
                <span className="line-clamp-3">
                  {replyTo.message ??
                    friendly(
                      replyTo.event_type,
                    )}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setReplyTo(null)
                  }
                  className="font-bold text-[#36133b]"
                  aria-label="Cancel reply"
                >
                  <X size={14} />
                </button>
              </div>
            ) : null}

            <form
              onSubmit={submit}
              className="mt-4"
            >
              <textarea
                rows={6}
                value={comment}
                onChange={(event) =>
                  setComment(
                    event.target.value,
                  )
                }
                placeholder="Write an update, comment or manager instruction..."
                className="w-full resize-none rounded-xl border border-[#e3dae4] p-3 text-sm outline-none transition focus:border-[#765078]"
              />

              <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4a1b51]">
                <Send size={15} />
                {replyTo
                  ? 'Send reply'
                  : 'Post update'}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-[#e9e2ea] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[#261c27]">
                  Add supporting file
                </h2>
                <p className="mt-1 text-xs text-[#918693]">
                  Private files · 10 MB
                  max
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4eff6] text-[#36133b]">
                <Paperclip
                  size={17}
                />
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={(event) =>
                chooseFile(
                  event.target
                    .files?.[0],
                )
              }
            />

            {selectedFile ? (
              <div className="mt-4 rounded-xl border border-[#e6dde7] bg-[#fcfafc] p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#765078] shadow-sm">
                    <FileText
                      size={17}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {
                        selectedFile.name
                      }
                    </p>

                    <p className="mt-0.5 text-xs text-[#918693]">
                      {formatBytes(
                        selectedFile.size,
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(
                        null,
                      );

                      if (
                        fileInputRef.current
                      ) {
                        fileInputRef.current.value =
                          '';
                      }
                    }}
                    className="text-[#918693] hover:text-[#36133b]"
                    aria-label="Remove selected file"
                  >
                    <X size={15} />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={uploading}
                  onClick={() =>
                    void uploadAttachment()
                  }
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4a1b51] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <Upload
                      size={15}
                    />
                  )}

                  {uploading
                    ? 'Uploading...'
                    : 'Upload file'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d7cad9] bg-[#fcfafc] px-4 py-5 text-sm font-semibold text-[#765078] transition hover:border-[#765078] hover:bg-[#f8f3f9]"
              >
                <Paperclip
                  size={16}
                />
                Choose file
              </button>
            )}

            <p className="mt-2 text-[11px] leading-5 text-[#918693]">
              PDF, PNG, JPG, WEBP,
              Word, Excel or TXT.
            </p>

            <div className="mt-5 border-t border-[#eee8ef] pt-4">
              {task.attachments.length >
              0 ? (
                <div className="space-y-2">
                  {task.attachments.map(
                    (attachment) => (
                      <AttachmentCard
                        key={
                          attachment.id
                        }
                        attachment={
                          attachment
                        }
                        downloading={
                          downloadingId ===
                          attachment.id
                        }
                        deleting={
                          deletingId ===
                          attachment.id
                        }
                        onDownload={() =>
                          void downloadAttachment(
                            attachment,
                          )
                        }
                        onDelete={() =>
                          void deleteAttachment(
                            attachment,
                          )
                        }
                      />
                    ),
                  )}
                </div>
              ) : (
                <div className="py-3 text-center">
                  <p className="text-sm font-medium text-[#6f6170]">
                    No files yet
                  </p>
                  <p className="mt-1 text-xs text-[#918693]">
                    Attachments will
                    also appear in the
                    timeline.
                  </p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function AttachmentCard({
  attachment,
  compact = false,
  downloading,
  deleting,
  onDownload,
  onDelete,
}: {
  attachment: Attachment;
  compact?: boolean;
  downloading: boolean;
  deleting: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const busy =
    downloading || deleting;

  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-xl border border-[#e8e0e9] bg-white ${
        compact
          ? 'p-2.5'
          : 'p-3'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f4eff6] text-[#765078]">
        <FileText size={16} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#433945]">
          {attachment.file_name}
        </p>

        <p className="mt-0.5 text-[11px] text-[#918693]">
          {formatBytes(
            attachment.file_size,
          )}
          {attachment.uploader_first_name
            ? ` · ${attachment.uploader_first_name} ${attachment.uploader_last_name ?? ''}`.trim()
            : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          disabled={busy}
          onClick={onDownload}
          className="rounded-lg p-2 text-[#765078] transition hover:bg-[#f4eff6] disabled:opacity-50"
          aria-label={`Download ${attachment.file_name}`}
          title="Download"
        >
          {downloading ? (
            <Loader2
              size={15}
              className="animate-spin"
            />
          ) : (
            <Download size={15} />
          )}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="rounded-lg p-2 text-[#a5525c] transition hover:bg-red-50 disabled:opacity-50"
          aria-label={`Delete ${attachment.file_name}`}
          title="Delete"
        >
          {deleting ? (
            <Loader2
              size={15}
              className="animate-spin"
            />
          ) : (
            <Trash2 size={15} />
          )}
        </button>
      </div>
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-[#765078]">
        {icon}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#918693]">
          {label}
        </p>

        <p className="mt-1 text-sm font-medium">
          {value}
        </p>
      </div>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  active,
  detail,
}: {
  number: string;
  title: string;
  active: boolean;
  detail: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${active ? 'border-[#d8c8dc] bg-[#f8f4f9]' : 'border-[#ece6ed] bg-white'}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-[#36133b] text-white' : 'bg-[#eee8ef] text-[#918693]'}`}>
          {number}
        </span>
        <p className="text-sm font-semibold text-[#433945]">{title}</p>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#817681]">{detail}</p>
    </div>
  );
}

function nextStep(task: Task) {
  if (!task.assigned_to_id) return 'Assign this task to a staff member.';
  if (task.status === 'COMPLETED') return 'The task is complete. Review the timeline, files and completion evidence.';
  if (task.status === 'CANCELLED') return 'This task has been cancelled. No further staff action is expected.';
  if (!task.accepted_at) return `Waiting for ${task.assignee_first_name ?? 'the assigned staff member'} to accept the task.`;
  if (!task.started_at && task.status !== 'IN_PROGRESS') return 'The assigned staff member has accepted the task and should start work next.';
  return 'Work is in progress. Staff should post meaningful progress updates/files and mark the task completed when the outcome is achieved.';
}

function LifecyclePill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[#f4eff6] px-2.5 py-1 text-xs font-semibold text-[#36133b]">
      {label}
    </span>
  );
}

function friendly(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(
      /^./,
      (character) =>
        character.toUpperCase(),
    );
}

function actor(event: Event) {
  return event.actor_first_name
    ? `${event.actor_first_name} ${event.actor_last_name ?? ''}`.trim()
    : 'System';
}

function formatBytes(
  bytes: number | null,
) {
  if (
    bytes === null ||
    !Number.isFinite(bytes)
  ) {
    return 'Unknown size';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}
