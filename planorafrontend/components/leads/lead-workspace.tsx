'use client';

import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import { Progress } from '@/components/ui/progress';
import { approveProspect, rejectProspect } from '@/lib/delivery/api';
import {
  addPursuitComment,
  createAdminRequiredPursuitStep,
  deleteContact,
  getLead,
  getLeadPursuit,
  listAssignmentHistory,
  listLeadActivities,
  listLeadContacts,
  markPursuitStepReviewed,
  reassignLead,
  requestPursuitRetake,
  assignLeadToTeam,
  updateLeadRevenue,
} from '@/lib/leads/api';
import { formatDate, organizationLocation, ownerName, priorityLabel, stageLabel } from '@/lib/leads/helpers';
import type { Activity, AssignmentHistory, Contact, ContactMethod, Lead, Pursuit, PursuitStep } from '@/lib/leads/types';
import { ContactDialog, methodTypeLabel } from './add-contact-dialog';
import { ReassignLeadDialog } from './lead-operations-dialogs';
import { listManagedTeams } from '@/lib/workspace/ops-api';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { LeadPriorityPill, LeadStagePill } from './lead-status';

type WorkspaceTab = 'overview' | 'contacts' | 'pursuit' | 'activity';

export function LeadWorkspace({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pursuit, setPursuit] = useState<Pursuit | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [dialog, setDialog] = useState<'reassign' | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const refreshLead = useCallback(async () => {
    const record = await getLead(leadId);
    setLead(record);
    return record;
  }, [leadId]);

  const refreshWorkspace = useCallback(async () => {
    setError(null);
    try {
      const record = await refreshLead();
      const [contactData, pursuitData, activityData, historyData] = await Promise.all([
        listLeadContacts(record.organization_id),
        getLeadPursuit(leadId),
        listLeadActivities(leadId),
        listAssignmentHistory(leadId),
      ]);
      setContacts(contactData);
      setPursuit(pursuitData);
      setActivities(activityData);
      setAssignmentHistory(historyData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load this lead.');
    } finally {
      setLoading(false);
    }
  }, [leadId, refreshLead]);


  useEffect(() => { Promise.resolve().then(refreshWorkspace); }, [refreshWorkspace]);

  if (loading) return <AppShell area="admin" title="Lead Workspace" breadcrumb="Sales / Leads"><PageLoadingState /></AppShell>;
  if (error || !lead) return <AppShell area="admin" title="Lead Workspace" breadcrumb="Sales / Leads"><PageErrorState message={error ?? 'Lead not found.'} /></AppShell>;

  const tabs: Array<{ value: WorkspaceTab; label: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'contacts', label: `Contacts (${contacts.length})` },
    { value: 'pursuit', label: 'Pursuit' },
    { value: 'activity', label: `Timeline (${activities.length})` },
  ];

  return (
    <AppShell area="admin" title={lead.organization_name} breadcrumb="Sales / Leads">
      <div className="lead-workspace">
        <Link href="/leads" className="back-link">← Leads</Link>
        {success ? <Alert tone="success">{success}</Alert> : null}
        <RecordHeader
          lead={lead}
          actions={<>
            {lead.stage === 'READY_FOR_PROSPECT_REVIEW' ? <>
              <Button size="sm" variant="outline" disabled={reviewBusy} onClick={async()=>{const reason=window.prompt('Why is this Lead not ready for Prospect conversion? (optional)')??undefined;setReviewBusy(true);try{await rejectProspect(leadId,reason);await refreshWorkspace();setSuccess('Prospect recommendation returned to Engaged for more work.')}finally{setReviewBusy(false)}}}>Return for work</Button>
              <Button size="sm" loading={reviewBusy} onClick={async()=>{if(!window.confirm(`Approve ${lead.organization_name} as a Prospect?`))return;setReviewBusy(true);try{await approveProspect(leadId);window.location.href='/prospects'}finally{setReviewBusy(false)}}}>Approve Prospect</Button>
            </> : null}
            {lead.assigned_to_id ? <Button size="sm" variant={lead.stage==='READY_FOR_PROSPECT_REVIEW'?'outline':'primary'} onClick={() => setDialog('reassign')}>Reassign Lead</Button> : null}
          </>}
        />
        <div className="record-tabs" role="tablist">
          {tabs.map((item) => <button key={item.value} role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)}>{item.label}</button>)}
        </div>
        {tab === 'overview' && <><CommercialOwnership lead={lead} changed={refreshWorkspace}/><Overview lead={lead} /><AssignmentHistoryView history={assignmentHistory}/></>}
        {tab === 'contacts' && <Contacts contacts={contacts} onAdd={() => { setEditingContact(null); setContactOpen(true); }} onEdit={(contact) => { setEditingContact(contact); setContactOpen(true); }} onDelete={async (contact) => { const name = `${contact.first_name} ${contact.last_name}`.trim(); if (!window.confirm(`Delete ${name}? This will also remove their contact methods.`)) return; await deleteContact(contact.id); setContacts(await listLeadContacts(lead.organization_id)); }} />}
        {tab === 'pursuit' && (
          <PursuitView
            leadId={leadId}
            pursuit={pursuit}
            onChanged={async (value) => {
              setPursuit(value);
              await refreshLead();
            }}
          />
        )}
        {tab === 'activity' && <ActivityView activities={activities} />}
        {contactOpen ? <ContactDialog
          key={editingContact?.id ?? 'new-contact'}
          open
          organizationId={lead.organization_id}
          contact={editingContact}
          onClose={() => { setContactOpen(false); setEditingContact(null); }}
          onSaved={async () => {
            setContacts(await listLeadContacts(lead.organization_id));
            setContactOpen(false);
            setEditingContact(null);
          }}
        /> : null}
        {dialog==='reassign'?<ReassignLeadDialog currentOwnerId={lead.assigned_to_id} currentOwner={ownerName(lead)} onClose={()=>setDialog(null)} onConfirm={async(input)=>{await reassignLead(leadId,input);await refreshWorkspace();setDialog(null);setSuccess('Lead reassigned. Existing pursuit progress and history were preserved.');}}/>:null}
      </div>
    </AppShell>
  );
}

function RecordHeader({ lead, actions }: { lead: Lead; actions?: ReactNode }) {
  return (
    <Card className="record-header">
      <div className="record-title"><div><span className="eyebrow">Organization lead</span><h1>{lead.organization_name}</h1><p>{[lead.industry, organizationLocation(lead)].filter(Boolean).join(' · ') || 'Organization pursuit'}</p></div><div className="record-header-actions"><Badge tone="purple">LEAD</Badge>{actions}</div></div>
      <div className="record-meta">
        <HeaderMeta label="Stage"><LeadStagePill stage={lead.stage} /></HeaderMeta>
        <HeaderMeta label="Owner" value={lead.assigned_team_name?`Team · ${lead.assigned_team_name}`:ownerName(lead)} /><HeaderMeta label="Proposed revenue" value={new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(lead.proposed_revenue||0))} /><HeaderMeta label="Weighted pipeline" value={new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(lead.weighted_revenue||0))} />
        <HeaderMeta label="Priority"><LeadPriorityPill priority={lead.priority} /></HeaderMeta>
        <HeaderMeta label="Progress"><span>{lead.pursuit_progress}%</span><Progress value={lead.pursuit_progress} /></HeaderMeta>
        <HeaderMeta label="Next follow-up" value={lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : '—'} />
        <HeaderMeta label="Assignment">{lead.current_assignment_batch_id?<Link className="assignment-link" href={`/assignments/${lead.current_assignment_batch_id}`}>{lead.current_assignment_title||'View assignment'} →</Link>:(lead.current_assignment_title||'—')}</HeaderMeta>
      </div>
    </Card>
  );
}

function HeaderMeta({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return <div><span className="record-meta-label">{label}</span><div className="record-meta-value">{children ?? value ?? '—'}</div></div>;
}

function CommercialOwnership({lead,changed}:{lead:Lead;changed:()=>Promise<void>}){const[teams,setTeams]=useState<any[]>([]),[team,setTeam]=useState(lead.assigned_team_id||''),[proposed,setProposed]=useState(String(lead.proposed_revenue||1000000)),[probability,setProbability]=useState(String(lead.revenue_probability||30)),[actual,setActual]=useState(lead.actual_revenue==null?'':String(lead.actual_revenue)),[busy,setBusy]=useState(false);useEffect(()=>{void listManagedTeams().then(setTeams).catch(()=>setTeams([]))},[]);return <Card className="workspace-card"><header><div><h2>Ownership & revenue</h2><p>Assign this opportunity to an individual through Assign/Reassign, or to a cross-department Team. Revenue powers management analytics.</p></div></header><div className="lead-form-grid"><NativeSelect label="Assigned team" value={team} onChange={e=>setTeam(e.target.value)}><option value="">No team ownership</option>{teams.filter(t=>t.is_active).map(t=><option key={t.id} value={t.id}>{t.name}{t.manager_first_name?` · Lead: ${t.manager_first_name} ${t.manager_last_name}`:''}</option>)}</NativeSelect><Input label="Proposed revenue (₦)" type="number" min="0" value={proposed} onChange={e=>setProposed(e.target.value)}/><Input label="Probability (%)" type="number" min="0" max="100" value={probability} onChange={e=>setProbability(e.target.value)}/><Input label="Actual revenue (₦)" type="number" min="0" placeholder="After conversion" value={actual} onChange={e=>setActual(e.target.value)}/></div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}><Button variant="outline" loading={busy} onClick={async()=>{setBusy(true);try{await assignLeadToTeam(lead.id,team||null);await changed()}finally{setBusy(false)}}}>Save team ownership</Button><Button loading={busy} onClick={async()=>{setBusy(true);try{await updateLeadRevenue(lead.id,{proposedRevenue:Number(proposed||0),revenueProbability:Number(probability||0),actualRevenue:actual?Number(actual):null});await changed()}finally{setBusy(false)}}}>Save revenue</Button></div></Card>}

function Overview({ lead }: { lead: Lead }) {
  const fields: Array<[string, ReactNode]> = [
    ['Organization', lead.organization_name], ['Lifecycle', 'LEAD'], ['Stage', stageLabel(lead.stage)],
    ['Priority', priorityLabel(lead.priority)], ['Owner', lead.assigned_team_name?`Team · ${lead.assigned_team_name}`:ownerName(lead)], ['Proposed revenue', new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(lead.proposed_revenue||0))], ['Revenue probability', `${lead.revenue_probability||0}%`], ['Weighted pipeline', new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(lead.weighted_revenue||0))], ['Actual revenue', lead.actual_revenue?new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(lead.actual_revenue)):'—'], ['Pursuit progress', `${lead.pursuit_progress}%`],
    ['Assignment', lead.current_assignment_batch_id?<Link className="assignment-link" href={`/assignments/${lead.current_assignment_batch_id}`}>{lead.current_assignment_title||'View assignment'} →</Link>:(lead.current_assignment_title||'—')], ['Assignment deadline', lead.current_assignment_due_at ? formatDate(lead.current_assignment_due_at) : '—'],
    ['Website', lead.organization_website], ['Industry', lead.industry], ['Organization email', lead.organization_email],
    ['Organization phone', lead.organization_phone], ['Location', organizationLocation(lead)], ['Source', lead.source],
    ['Created', formatDate(lead.created_at)], ['Next action', lead.next_action],
    ['Next follow-up', lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : null],
  ];
  return <Card className="workspace-card"><header><div><h2>Lead overview</h2><p>Current organization and pursuit information.</p></div></header><dl className="detail-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></Card>;
}


function PursuitView({
  leadId,
  pursuit,
  onChanged,
}: {
  leadId: string;
  pursuit: Pursuit | null;
  onChanged: (value: Pursuit) => Promise<void>;
}) {
  const [commentStep, setCommentStep] = useState<PursuitStep | null>(null);
  const [retakeStep, setRetakeStep] = useState<PursuitStep | null>(null);
  const [requiredAfter, setRequiredAfter] = useState<PursuitStep | null>(null);

  if (!pursuit) {
    return (
      <Card>
        <EmptyState
          icon="workflow"
          title="No pursuit workflow yet"
          description="The pursuit workspace begins after this Lead is assigned through a workflow."
        />
      </Card>
    );
  }

  const steps = [...pursuit.steps].sort((a, b) => a.position - b.position);
  const currentIndex = steps.findIndex((step) => !step.completed);

  async function refresh() {
    const updated = await getLeadPursuit(leadId);
    if (updated) await onChanged(updated);
  }

  return (
    <>
      <Card className="workspace-card pursuit-summary-card">
        <header>
          <div>
            <span className="eyebrow">Pursuit</span>
            <h2>Staff pursuit journey</h2>
            <p>
              Research is the first part of the pursuit. Review staff submissions,
              evidence and progress without blocking normal work.
            </p>
          </div>
          <Badge tone="purple">
            {steps.filter((step) => step.completed).length}/{steps.length} complete
          </Badge>
        </header>
      </Card>

      <ol className="pursuit-vertical" aria-label="Staff pursuit journey">
        {steps.map((step, index) => {
          const current =
            !step.completed &&
            (currentIndex === index || currentIndex === -1);

          return (
            <li
              key={step.id}
              className={[
                "pursuit-vertical-item",
                step.completed ? "is-complete" : "",
                current ? "is-current" : "",
                step.review_status === "RETAKE_REQUIRED"
                  ? "is-retake"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="pursuit-vertical-rail" aria-hidden="true">
                <span className="pursuit-vertical-dot">
                  {step.completed ? "✓" : step.position}
                </span>
              </div>

              <ReadOnlyPursuitStep
                step={step}
                current={current}
                onComment={() => setCommentStep(step)}
                onRetake={() => setRetakeStep(step)}
                onRequireStep={() => setRequiredAfter(step)}
                onReviewed={async () => {
                  await onChanged(
                    await markPursuitStepReviewed(leadId, step.id),
                  );
                }}
              />
            </li>
          );
        })}
      </ol>

      {commentStep ? (
        <PursuitTextDialog
          title={`Comment on ${commentStep.title}`}
          description="Leave guidance or feedback for this pursuit step. A comment does not block staff from continuing."
          label="Comment"
          placeholder="Write your feedback..."
          confirmLabel="Add comment"
          onClose={() => setCommentStep(null)}
          onConfirm={async (value) => {
            await addPursuitComment(leadId, commentStep.id, value);
            await refresh();
            setCommentStep(null);
          }}
        />
      ) : null}

      {retakeStep ? (
        <PursuitTextDialog
          title={`Request retake: ${retakeStep.title}`}
          description="The existing submission and evidence remain in history. This step will reopen and must be completed again before later pursuit steps can continue."
          label="Reason for retake"
          placeholder="Explain what needs to be corrected or repeated..."
          confirmLabel="Request retake"
          danger
          onClose={() => setRetakeStep(null)}
          onConfirm={async (value) => {
            await onChanged(
              await requestPursuitRetake(leadId, retakeStep.id, value),
            );
            setRetakeStep(null);
          }}
        />
      ) : null}

      {requiredAfter ? (
        <RequiredPursuitStepDialog
          after={requiredAfter}
          onClose={() => setRequiredAfter(null)}
          onConfirm={async (input) => {
            await onChanged(
              await createAdminRequiredPursuitStep(leadId, {
                ...input,
                afterStepId: requiredAfter.id,
              }),
            );
            setRequiredAfter(null);
          }}
        />
      ) : null}
    </>
  );
}

function ReadOnlyPursuitStep({
  step,
  current,
  onComment,
  onRetake,
  onRequireStep,
  onReviewed,
}: {
  step: PursuitStep;
  current: boolean;
  onComment: () => void;
  onRetake: () => void;
  onRequireStep: () => void;
  onReviewed: () => Promise<void>;
}) {
  const completedBy = [
    step.completed_by_first_name,
    step.completed_by_last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const originLabel =
    step.step_origin === "ADMIN_REQUIRED"
      ? "Admin required"
      : step.step_origin === "STAFF_CUSTOM"
        ? "Staff added"
        : "Workflow";

  const status =
    step.review_status === "RETAKE_REQUIRED"
      ? "Retake required"
      : step.completed
        ? "Completed"
        : current
          ? "Current"
          : "Pending";

  return (
    <Card className="workspace-card admin-step-card pursuit-vertical-card">
      <header>
        <div>
          <div className="pursuit-step-kicker">
            <span className="eyebrow">Step {step.position}</span>
            <Badge
              tone={
                step.step_origin === "ADMIN_REQUIRED"
                  ? "warning"
                  : step.step_origin === "STAFF_CUSTOM"
                    ? "purple"
                    : "neutral"
              }
            >
              {originLabel}
            </Badge>
          </div>

          <h2>{step.title}</h2>
          <p>{step.description || "No description provided."}</p>
        </div>

        <Badge
          tone={
            step.review_status === "RETAKE_REQUIRED"
              ? "danger"
              : step.completed
                ? "success"
                : current
                  ? "warning"
                  : "neutral"
          }
        >
          {status}
        </Badge>
      </header>

      {step.review_status === "RETAKE_REQUIRED" ? (
        <Alert tone="error">
          <strong>Retake requested.</strong>{" "}
          {step.retake_reason || "This step must be completed again."}
        </Alert>
      ) : null}

      <div className="admin-step-meta">
        <div>
          <span>Status</span>
          <strong>{status}</strong>
        </div>
        <div>
          <span>Completed by</span>
          <strong>{completedBy || "—"}</strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>{step.completed_at ? formatDate(step.completed_at) : "—"}</strong>
        </div>
        <div>
          <span>Admin review</span>
          <strong>
            {step.review_status === "APPROVED"
              ? "Reviewed"
              : step.completed
                ? "Optional"
                : "—"}
          </strong>
        </div>
      </div>

      <section className="admin-step-response">
        <span className="eyebrow">Staff response</span>
        {step.notes ? (
          <p>{step.notes}</p>
        ) : (
          <p className="muted">No staff response has been recorded yet.</p>
        )}
      </section>

      <section className="evidence-block admin-evidence-block">
        <strong>Evidence · required</strong>

        {step.evidence.length ? (
          <ul>
            {step.evidence.map((file) => (
              <li key={file.id}>
                <span>{file.file_name}</span>
                <small>
                  {Math.ceil(file.file_size / 1024)} KB ·{" "}
                  {formatDate(file.created_at)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No evidence has been uploaded for this step.</p>
        )}
      </section>

      {step.comments?.length ? (
        <section className="pursuit-review-comments">
          <span className="eyebrow">Admin comments</span>
          <ol>
            {step.comments.map((comment) => (
              <li key={comment.id}>
                <strong>
                  {[
                    comment.author_first_name,
                    comment.author_last_name,
                  ]
                    .filter(Boolean)
                    .join(" ") || "Administrator"}
                </strong>
                <p>{comment.body}</p>
                <small>{formatDate(comment.created_at)}</small>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {step.submissions?.length ? (
        <details className="pursuit-submission-history">
          <summary>
            Submission history ({step.submissions.length})
          </summary>

          <div>
            {step.submissions.map((submission) => (
              <article key={submission.id}>
                <strong>
                  Submission #{submission.submission_number}
                </strong>
                <span>
                  {formatDate(submission.submitted_at)} ·{" "}
                  {[
                    submission.submitted_by_first_name,
                    submission.submitted_by_last_name,
                  ]
                    .filter(Boolean)
                    .join(" ") || "Staff"}
                </span>
                {submission.notes ? <p>{submission.notes}</p> : null}
                {submission.evidence?.length ? (
                  <ul>
                    {submission.evidence.map((file) => (
                      <li key={file.id}>{file.file_name}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </details>
      ) : null}

      <footer className="pursuit-admin-actions">
        <Button size="sm" variant="outline" onClick={onComment}>
          Comment
        </Button>

        {step.completed && step.review_status !== "APPROVED" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onReviewed()}
          >
            Mark reviewed
          </Button>
        ) : null}

        {step.completed ? (
          <Button size="sm" variant="outline" onClick={onRetake}>
            Request retake
          </Button>
        ) : null}

        <Button size="sm" onClick={onRequireStep}>
          + Require step after
        </Button>
      </footer>
    </Card>
  );
}

function PursuitTextDialog({
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" role="presentation">
      <Card className="pursuit-dialog" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </header>

        <label className="pursuit-field">
          <span>{label}</span>
          <textarea
            rows={5}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <footer>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!value.trim()) {
                setError(`${label} is required.`);
                return;
              }

              setSaving(true);
              setError(null);

              try {
                await onConfirm(value.trim());
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Unable to save this review.",
                );
                setSaving(false);
              }
            }}
            loading={saving}
          >
            {danger ? "Request retake" : confirmLabel}
          </Button>
        </footer>
      </Card>
    </div>
  );
}

function RequiredPursuitStepDialog({
  after,
  onClose,
  onConfirm,
}: {
  after: PursuitStep;
  onClose: () => void;
  onConfirm: (input: {
    title: string;
    description: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" role="presentation">
      <Card className="pursuit-dialog" role="dialog" aria-modal="true">
        <header>
          <div>
            <span className="eyebrow">Admin-required pursuit step</span>
            <h2>Add required step</h2>
            <p>
              This will be inserted after <strong>{after.title}</strong>.
              Staff must complete it with evidence before continuing.
            </p>
          </div>
        </header>

        <label className="pursuit-field">
          <span>Step title</span>
          <input
            value={title}
            placeholder="Example: Verify procurement decision maker"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="pursuit-field">
          <span>Instructions</span>
          <textarea
            rows={4}
            value={description}
            placeholder="Explain what staff should complete..."
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <Alert tone="info">
          Evidence is required automatically for every pursuit step.
        </Alert>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <footer>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              if (!title.trim()) {
                setError("Step title is required.");
                return;
              }

              setSaving(true);
              setError(null);

              try {
                await onConfirm({
                  title: title.trim(),
                  description: description.trim() || null,
                });
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Unable to add the required step.",
                );
                setSaving(false);
              }
            }}
          >
            Add required step
          </Button>
        </footer>
      </Card>
    </div>
  );
}

function Contacts({ contacts, onAdd, onEdit, onDelete }: { contacts: Contact[]; onAdd: () => void; onEdit: (contact: Contact) => void; onDelete: (contact: Contact) => Promise<void> }) {
  return <Card className="workspace-card"><header><div><h2>Organization contacts</h2><p>People attached to this organization and available across PlanoraHub Contacts.</p></div><Button onClick={onAdd}>+ Add Contact</Button></header>{contacts.length === 0 ? <EmptyState icon="contacts" title="No contact identified yet" description="Identify a relevant person at this organization before outreach." action={<Button onClick={onAdd}>+ Add Contact</Button>} /> : <div className="contact-list">{contacts.map((contact) => <article key={contact.id}><div className="contact-heading"><div><strong>{contact.first_name} {contact.last_name}</strong>{contact.is_primary ? <Badge tone="purple">Primary</Badge> : null}<p>{contact.job_title || 'Role not provided'}</p></div><div className="contact-card-actions"><button type="button" className="contact-icon-action" aria-label={`Edit ${contact.first_name} ${contact.last_name}`} title="Edit contact" onClick={() => onEdit(contact)}><EditIcon /></button><button type="button" className="contact-icon-action contact-icon-action-danger" aria-label={`Delete ${contact.first_name} ${contact.last_name}`} title="Delete contact" onClick={() => { void onDelete(contact); }}><TrashIcon /></button></div></div>{contact.methods.length ? <dl className="contact-method-list">{contact.methods.map(method => <ContactMethodRow key={method.id} method={method} />)}</dl> : <p className="muted">No contact methods recorded.</p>}{contact.notes ? <p>{contact.notes}</p> : null}</article>)}</div>}</Card>;
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.83 2.83 0 0 0-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="m13.5 6.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function ContactMethodRow({method}:{method:ContactMethod}){
  const href=contactMethodHref(method);
  const value=href?(href.startsWith('/')?<Link href={href}>{method.value}</Link>:<a href={href} target={href.startsWith('http')?'_blank':undefined} rel={href.startsWith('http')?'noreferrer':undefined}>{method.value}</a>):method.value;
  const tone=method.verification_status==='VERIFIED'?'success':method.verification_status==='INVALID'?'danger':'neutral';
  return <div><dt>{method.legacy_source ? methodTypeLabel(method.type) : (method.label || methodTypeLabel(method.type))}</dt><dd><span>{value}</span><Badge tone={tone}>{method.verification_status[0]+method.verification_status.slice(1).toLowerCase()}</Badge></dd>{method.notes?<p>{method.notes}</p>:null}</div>;
}

function contactMethodHref(method:ContactMethod){
  if(method.type==='EMAIL')return `/email?compose=1&to=${encodeURIComponent(method.value)}`;
  if(method.type==='PHONE')return `tel:${method.value}`;
  if(/^https?:\/\//i.test(method.value))return method.value;
  return undefined;
}

function ActivityView({ activities }: { activities: Activity[] }) {
  return (
    <Card className="workspace-card">
      <header>
        <div>
          <h2>Lead timeline</h2>
          <p>
            A chronological case history for this Lead: follow-ups, communications, notes and outcomes as the relationship progresses.
          </p>
        </div>
      </header>

      {activities.length === 0 ? (
        <EmptyState
          icon="activity"
          title="No activity recorded"
          description="Staff business activities linked to this lead will appear here."
        />
      ) : (
        <ol className="activity-timeline">
          {activities.map((activity) => (
            <li key={activity.id}>
              <time>
                {formatDate(
                  activity.scheduled_at ||
                    activity.completed_at ||
                    activity.created_at,
                )}
              </time>

              <div>
                <div>
                  <Badge tone="neutral">
                    {activity.activity_type.replace('_', ' ')}
                  </Badge>
                  <Badge
                    tone={
                      activity.status === 'COMPLETED'
                        ? 'success'
                        : activity.status === 'CANCELLED'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {activity.status.replace('_', ' ')}
                  </Badge>
                </div>

                <strong>{activity.title}</strong>

                {activity.description ? <p>{activity.description}</p> : null}

                {activity.outcome ? (
                  <p>
                    <b>Outcome:</b> {activity.outcome}
                  </p>
                ) : null}

                {activity.next_follow_up_at ? (
                  <p>
                    <b>Next follow-up:</b>{' '}
                    {formatDate(activity.next_follow_up_at)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function AssignmentHistoryView({history}:{history:AssignmentHistory[]}){
  return <Card className="workspace-card"><header><div><h2>Assignment history</h2><p>Stored ownership handovers for this lead.</p></div></header>{history.length?<ol className="activity-timeline">{history.map((item)=><li key={item.id}><time>{formatDate(item.assigned_at)}</time><div><strong>{item.previous_owner_id?'Reassigned':'Assigned'}</strong><p>{item.previous_owner_id?`${personName(item.previous_owner_first_name,item.previous_owner_last_name)} → `:''}{personName(item.assigned_to_first_name,item.assigned_to_last_name)}</p>{item.reason?<p>Reason: {item.reason}</p>:null}<p className="muted">Changed by {personName(item.assigned_by_first_name,item.assigned_by_last_name)}</p></div></li>)}</ol>:<EmptyState icon="activity" title="No assignment history" description="Assignment events will appear after this lead is assigned."/>}</Card>;
}

function personName(first:string|null,last:string|null){return [first,last].filter(Boolean).join(' ')||'Unknown user';}
