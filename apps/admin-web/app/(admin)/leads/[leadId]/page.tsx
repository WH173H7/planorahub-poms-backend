'use client';

import {
  ArrowLeft,
  Building2,
  CalendarClock,
  History,
  UserRound,
} from 'lucide-react';
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

type Lead = {
  id: string;
  title: string;
  organization_name: string;
  stage: string;
  priority: string;
  lead_score: number | null;
  source: string | null;
  assigned_to_id: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  next_action: string | null;
  next_follow_up_at: string | null;
  competitor_name: string | null;
  competitor_notes: string | null;
  business_need_identified: boolean;
  decision_maker_identified: boolean;
  budget_indicated: boolean;
  timeline_known: boolean;
  organization_fit: boolean;
  notes: string | null;
};

type Assignment = {
  id: string;
  assigned_to_first_name: string | null;
  assigned_to_last_name: string | null;
  assigned_by_first_name: string | null;
  assigned_by_last_name: string | null;
  reason: string | null;
  assigned_at: string;
};

type Staff = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
};

type PursuitStep={id:string;title:string;position:number;evidence_required:boolean;completed:boolean;completed_at:string|null;notes:string|null;evidence:Array<{id:string;file_name:string}>};
type Pursuit={id:string;steps:PursuitStep[]};

type R<T> = {
  success: boolean;
  data: T;
};

export default function LeadDetailPage() {
  const { leadId } =
    useParams<{
      leadId: string;
    }>();
  const router = useRouter();

  const [lead, setLead] =
    useState<Lead | null>(null);
  const [history, setHistory] =
    useState<Assignment[]>([]);
  const [staff, setStaff] =
    useState<Staff[]>([]);
  const [newOwner, setNewOwner] =
    useState('');
  const [reason, setReason] =
    useState('');
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [pursuit,setPursuit]=useState<Pursuit|null>(null);

  async function load() {
    try {
      setError(null);

      const [
        leadResponse,
        historyResponse,
        staffResponse,
        pursuitResponse,
      ] = await Promise.all([
        apiFetch<R<Lead>>(
          `/admin/leads/${leadId}`,
        ),
        apiFetch<R<Assignment[]>>(
          `/admin/leads/${leadId}/assignments`,
        ),
        apiFetch<R<Staff[]>>(
          '/admin/staff',
        ),
        apiFetch<R<Pursuit|null>>(`/admin/leads/${leadId}/pursuit`),
      ]);

      setLead(leadResponse.data);
      setHistory(
        historyResponse.data,
      );
      setStaff(staffResponse.data);
      setPursuit(pursuitResponse.data);
      setNewOwner(
        leadResponse.data
          .assigned_to_id ?? '',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load prospect.',
      );
    }
  }

  useEffect(() => {
    void load();
  }, [leadId]);

  async function assign(
    event: FormEvent,
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);

      await apiFetch(
        `/admin/leads/${leadId}/assignments`,
        {
          method: 'POST',
          body: JSON.stringify({
            assignedToId:
              newOwner || null,
            reason:
              reason.trim() || null,
          }),
        },
      );

      setReason('');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to reassign prospect.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!lead) {
    return (
      <div>
        <button
          onClick={() =>
            router.push('/leads')
          }
          className="flex items-center gap-2 text-sm font-semibold text-[#36133b]"
        >
          <ArrowLeft size={16}/>
          Leads
        </button>

        <div className="mt-6 text-sm text-[#817681]">
          {error ??
            'Loading prospect...'}
        </div>
      </div>
    );
  }

  const criteria = [
    {
      label:
        'Business need identified',
      value:
        lead.business_need_identified,
    },
    {
      label:
        'Decision maker identified',
      value:
        lead.decision_maker_identified,
    },
    {
      label:
        'Budget indication',
      value:
        lead.budget_indicated,
    },
    {
      label:
        'Timeline known',
      value:
        lead.timeline_known,
    },
    {
      label:
        'Good PlanoraHub fit',
      value:
        lead.organization_fit,
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px]">
      <button
        onClick={() =>
          router.push('/leads')
        }
        className="mb-5 flex items-center gap-2 text-sm font-semibold text-[#6f6170]"
      >
        <ArrowLeft size={16}/>
        Leads
      </button>

      {error ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {pursuit ? <section className="mb-6 rounded-2xl border border-[#e3d9e5] bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#8b818c]">Pursuit workflow</p><h2 className="mt-1 text-xl font-semibold">Lead progress checklist</h2></div><span className="rounded-full bg-[#f4eff6] px-3 py-1 text-sm font-semibold text-[#69456d]">{pursuit.steps.filter(s=>s.completed).length}/{pursuit.steps.length}</span></div><div className="mt-5 space-y-3">{pursuit.steps.map(step=><PursuitRow key={step.id} leadId={leadId} step={step} onChanged={load}/>)}</div></section> : <section className="mb-6 rounded-2xl border border-dashed border-[#d9cedb] bg-[#faf7fb] p-5 text-sm text-[#756b76]">No pursuit workflow is attached yet. Assign this lead from the Lead Pool with a pursuit workflow to start evidence-backed progress tracking.</section>}

      <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[#f4eff6] px-2.5 py-1 text-xs font-semibold text-[#36133b]">
                {friendly(
                  lead.stage,
                )}
              </span>

              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                {friendly(
                  lead.priority,
                )}
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-semibold">
              {lead.organization_name}
            </h1>

            <p className="mt-2 text-sm text-[#817681]">
              {lead.title}
            </p>
          </div>

          <div className="rounded-xl bg-[#faf7fb] px-5 py-4 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#918693]">
              Qualification
            </p>
            <p className="mt-1 text-3xl font-semibold text-[#36133b]">
              {lead.lead_score ?? 0}%
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-[#eee8ef] pt-5 sm:grid-cols-3">
          <Meta
            icon={<UserRound size={16}/>}
            label="Owner"
            value={
              lead.owner_first_name
                ? `${lead.owner_first_name} ${lead.owner_last_name ?? ''}`.trim()
                : 'Unassigned'
            }
          />

          <Meta
            icon={<CalendarClock size={16}/>}
            label="Next follow-up"
            value={
              lead.next_follow_up_at
                ? new Date(
                    lead.next_follow_up_at,
                  ).toLocaleString()
                : 'Not scheduled'
            }
          />

          <Meta
            icon={<Building2 size={16}/>}
            label="Source"
            value={
              lead.source ??
              'Not recorded'
            }
          />
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
          <h2 className="text-lg font-semibold">
            Qualification
          </h2>

          <p className="mt-1 text-sm text-[#817681]">
            The score is calculated from confirmed relationship facts.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {criteria.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-[#eee8ef] p-4"
              >
                <span className="text-sm">
                  {item.label}
                </span>
                <span className={`text-xs font-semibold ${
                  item.value
                    ? 'text-emerald-700'
                    : 'text-[#918693]'
                }`}>
                  {item.value
                    ? 'Confirmed'
                    : 'Not confirmed'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-7 border-t border-[#eee8ef] pt-6">
            <h2 className="text-lg font-semibold">
              Relationship context
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Info
                label="Next action"
                value={
                  lead.next_action ??
                  'No next action'
                }
              />

              <Info
                label="Current provider"
                value={
                  lead.competitor_name ??
                  'None recorded'
                }
              />
            </div>

            {lead.competitor_notes ? (
              <InfoBlock
                label="Provider / competitor notes"
                value={
                  lead.competitor_notes
                }
              />
            ) : null}

            {lead.notes ? (
              <InfoBlock
                label="Notes"
                value={lead.notes}
              />
            ) : null}
          </div>

          <div className="mt-7 border-t border-[#eee8ef] pt-6">
            <h2 className="text-lg font-semibold">
              Assignment history
            </h2>

            <p className="mt-1 text-sm text-[#817681]">
              Ownership changes remain part of the company's relationship history.
            </p>

            <div className="mt-5 space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-[#918693]">
                  No assignment changes recorded.
                </p>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#eee8ef] p-4"
                  >
                    <p className="text-sm font-semibold">
                      {item.assigned_to_first_name
                        ? `Assigned to ${item.assigned_to_first_name} ${item.assigned_to_last_name ?? ''}`.trim()
                        : 'Unassigned'}
                    </p>

                    <p className="mt-1 text-xs text-[#817681]">
                      {new Date(
                        item.assigned_at,
                      ).toLocaleString()}
                      {item.assigned_by_first_name
                        ? ` · by ${item.assigned_by_first_name} ${item.assigned_by_last_name ?? ''}`.trim()
                        : ''}
                    </p>

                    {item.reason ? (
                      <p className="mt-2 text-sm text-[#5f5560]">
                        {item.reason}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-[#e9e2ea] bg-white p-5 lg:sticky lg:top-[100px]">
          <h2 className="font-semibold">
            Assign / reassign
          </h2>

          <p className="mt-1 text-sm text-[#817681]">
            Ownership changes are preserved automatically.
          </p>

          <form
            onSubmit={assign}
            className="mt-5 space-y-4"
          >
            <label className="block">
              <span className="text-sm font-semibold">
                Owner
              </span>
              <select
                value={newOwner}
                onChange={(event) =>
                  setNewOwner(
                    event.target.value,
                  )
                }
                className="mt-2 h-10 w-full rounded-lg border border-[#e3dae4] bg-white px-3 text-sm"
              >
                <option value="">
                  Unassigned
                </option>

                {staff
                  .filter(
                    (member) =>
                      member.status !==
                      'DISABLED',
                  )
                  .map((member) => (
                    <option
                      key={member.id}
                      value={member.id}
                    >
                      {member.first_name}{' '}
                      {member.last_name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold">
                Reason
              </span>
              <textarea
                rows={4}
                value={reason}
                onChange={(event) =>
                  setReason(
                    event.target.value,
                  )
                }
                placeholder="Territory change, workload balancing, management decision..."
                className="mt-2 w-full resize-none rounded-lg border border-[#e3dae4] p-3 text-sm"
              />
            </label>

            <button
              disabled={saving}
              className="w-full rounded-lg bg-[#36133b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : 'Save assignment'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
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

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-[#faf7fb] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#918693]">
        {label}
      </p>

      <p className="mt-2 text-sm font-medium text-[#4e4350]">
        {value}
      </p>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-[#eee8ef] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#918693]">
        {label}
      </p>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5f5560]">
        {value}
      </p>
    </div>
  );
}

function PursuitRow({leadId,step,onChanged}:{leadId:string;step:PursuitStep;onChanged:()=>Promise<void>}){const [busy,setBusy]=useState(false);const [note,setNote]=useState(step.notes??'');async function toggle(){try{setBusy(true);await apiFetch(`/admin/leads/${leadId}/pursuit/steps/${step.id}`,{method:'PATCH',body:JSON.stringify({completed:!step.completed,notes:note})});await onChanged()}finally{setBusy(false)}}async function upload(files:FileList|null){const f=files?.[0];if(!f)return;try{setBusy(true);const d=new FormData();d.append('file',f,f.name);await apiFetch(`/admin/leads/${leadId}/pursuit/steps/${step.id}/evidence`,{method:'POST',body:d});await onChanged()}finally{setBusy(false)}}return <div className="rounded-xl border border-[#ece5ed] p-4"><div className="flex items-start gap-3"><input type="checkbox" checked={step.completed} disabled={busy} onChange={()=>void toggle()} className="mt-1 h-4 w-4 accent-[#36133b]"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{step.position}. {step.title}</p>{step.evidence_required?<span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Evidence required</span>:null}{step.completed?<span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Completed</span>:null}</div><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Progress note / what happened..." rows={2} className="mt-3 w-full rounded-lg border border-[#e3dae4] p-2 text-sm"/><div className="mt-2 flex flex-wrap items-center gap-3"><label className="cursor-pointer text-xs font-semibold text-[#69456d]">+ Upload evidence<input type="file" className="hidden" onChange={e=>void upload(e.target.files)}/></label>{step.evidence.map(e=><span key={e.id} className="rounded bg-[#f4eff6] px-2 py-1 text-xs">{e.file_name}</span>)}</div></div></div></div>}

function friendly(
  value: string,
) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(
      /^./,
      (character) =>
        character.toUpperCase(),
    );
}
