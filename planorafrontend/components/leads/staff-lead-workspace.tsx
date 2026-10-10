"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppShell } from "@/components/shell/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageErrorState, PageLoadingState } from "@/components/ui/page-state";
import { Progress } from "@/components/ui/progress";
import {
  createLeadActivity,
  getOwnedLead,
  getOwnedLeadPursuit,
  listOwnedLeadActivities,
  listOwnedLeadContacts,
  listOwnedLeadTasks,
  updateOwnedContactMethod,
} from "@/lib/leads/api";
import {
  formatDate,
  organizationLocation,
  ownerName,
} from "@/lib/leads/helpers";
import type {
  Activity,
  Contact,
  Lead,
  LeadTask,
  Pursuit,
  PursuitStep,
} from "@/lib/leads/types";
import { ContactDialog, methodTypeLabel } from "./add-contact-dialog";
import { LogActivityDialog } from "./lead-operations-dialogs";
import { LeadPriorityPill, LeadStagePill } from "./lead-status";
import { PursuitStageForm } from "./pursuit-stage-form";
import styles from "@/components/staff/staff-polish.module.css";

type Tab = "overview" | "research" | "contacts" | "pursuit" | "activity";
type PursuitStageState = "retake" | "complete" | "current" | "locked";

const pursuitStageStateClasses: Record<PursuitStageState, string> = {
  retake: styles.stageNav_retake,
  complete: styles.stageNav_complete,
  current: styles.stageNav_current,
  locked: styles.stageNav_locked,
};

const isOverdue = (value: string | null) => Boolean(value && new Date(value).getTime() < Date.now());
const prettyStatus = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

export function StaffLeadWorkspace({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pursuit, setPursuit] = useState<Pursuit | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact | null | undefined>(undefined);
  const [dialog, setDialog] = useState<"activity" | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const record = await getOwnedLead(leadId);
      const [people, process, timeline, workTasks] = await Promise.all([
        listOwnedLeadContacts(leadId),
        getOwnedLeadPursuit(leadId),
        listOwnedLeadActivities(leadId),
        listOwnedLeadTasks(leadId),
      ]);
      setLead(record);
      setContacts(people);
      setPursuit(process);
      setActivities(timeline);
      setTasks(workTasks);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load this assigned lead.",
      );
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const research = useMemo(
    () =>
      pursuit?.steps.find((step) =>
        step.title.toLowerCase().includes("research"),
      ) ?? null,
    [pursuit],
  );

  if (loading)
    return (
      <AppShell area="staff" title="Assigned Lead" breadcrumb="My Work / Leads">
        <PageLoadingState />
      </AppShell>
    );

  if (error || !lead)
    return (
      <AppShell area="staff" title="Assigned Lead" breadcrumb="My Work / Leads">
        <PageErrorState message={error ?? "Lead not found."} />
      </AppShell>
    );

  const tabs: Array<[Tab, string]> = [
    ["overview", "Overview"],
    ["research", "Research"],
    ["contacts", `Contacts (${contacts.length})`],
    ["pursuit", "Pursuit"],
    ["activity", `Activity (${activities.length})`],
  ];

  const completedSteps = pursuit?.steps.filter((step) => step.completed).length ?? 0;
  const totalSteps = pursuit?.steps.length ?? 0;

  return (
    <AppShell
      area="staff"
      title={lead.organization_name}
      breadcrumb="My Work / Assigned Leads"
    >
      <div className={styles.workspace}>
        <Link href="/my-work" className={styles.workspaceBack}>
          ← Back to My Work
        </Link>

        {success ? <Alert tone="success">{success}</Alert> : null}

        <Card className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div className={styles.heroIdentity}>
              <span className="eyebrow">Assigned organization lead</span>
              <h1>{lead.organization_name}</h1>
              <p>
                {[lead.industry, organizationLocation(lead)]
                  .filter(Boolean)
                  .join(" · ") || "Organization pursuit"}
              </p>
            </div>
            <div className={styles.heroActions}>
              {pursuit?.steps.length ? (
                <Button variant="outline" onClick={() => setTab("pursuit")}>
                  Continue Pursuit →
                </Button>
              ) : null}
              <Button onClick={() => setDialog("activity")}>+ Log Activity</Button>
            </div>
          </div>

          <div className={styles.heroMeta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Current stage</span>
              <div className={styles.metaValue}><LeadStagePill stage={lead.stage} /></div>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Owner</span>
              <div className={styles.metaValue}>{ownerName(lead)}</div>
              <span className={styles.metaSub}>Your assigned Lead</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Assignment</span>
              <div className={`${styles.metaValue} ${styles.metaValueWrap}`}>
                {lead.claimed_by_id ? <Badge tone="purple">Lead Pool</Badge> : lead.assigned_team_id ? <Badge tone="neutral">Team</Badge> : <Badge tone="neutral">Assigned</Badge>}
              </div>
              <span className={styles.metaSub}>
                {lead.claimed_by_id ? "Self-selected by you" : lead.assigned_team_id ? lead.assigned_team_name || "Team assignment" : "Admin assigned"}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Priority</span>
              <div className={styles.metaValue}><LeadPriorityPill priority={lead.priority} /></div>
              <span className={styles.metaSub}>{lead.current_assignment_due_at ? `Due ${formatDate(lead.current_assignment_due_at)}` : "No assignment deadline"}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Pursuit progress</span>
              <div className={styles.heroProgress}>
                <div className={styles.heroProgressTop}><span>{completedSteps} of {totalSteps || "—"} stages</span><strong>{lead.pursuit_progress}%</strong></div>
                <Progress value={lead.pursuit_progress} />
              </div>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Next follow-up</span>
              <div className={styles.metaValue}>{lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : "—"}</div>
              <span className={styles.metaSub}>{lead.next_action || "No next action recorded"}</span>
            </div>
          </div>
        </Card>

        <div className={styles.tabs} role="tablist" aria-label="Lead workspace sections">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`${styles.tab} ${tab === value ? styles.tabActive : ""}`}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <StaffOverview
            lead={lead}
            tasks={tasks}
            pursuit={pursuit}
            onContinuePursuit={() => setTab("pursuit")}
            onOpenContacts={() => setTab("contacts")}
            onLogActivity={() => setDialog("activity")}
          />
        ) : null}
        {tab === "research" ? (
          <StaffPursuit
            leadId={leadId}
            pursuit={pursuit}
            steps={research ? [research] : []}
            contacts={contacts}
            onChanged={async (value) => {
              setPursuit(value);
              setLead(await getOwnedLead(leadId));
            }}
            empty="No research step is configured for this pursuit."
          />
        ) : null}
        {tab === "contacts" ? (
          <StaffContacts
            contacts={contacts}
            onAdd={() => setContact(null)}
            onEdit={setContact}
            onVerify={async (contactRecord, method, verificationStatus) => {
              await updateOwnedContactMethod(leadId, contactRecord.id, method.id, {
                type: method.type,
                value: method.value,
                label: method.label,
                notes: method.notes,
                isPrimary: method.is_primary,
                verificationStatus,
              });
              setContacts(await listOwnedLeadContacts(leadId));
            }}
          />
        ) : null}
        {tab === "pursuit" ? (
          <StaffPursuit
            leadId={leadId}
            pursuit={pursuit}
            steps={pursuit?.steps ?? []}
            contacts={contacts}
            onChanged={async (value) => {
              setPursuit(value);
              setLead(await getOwnedLead(leadId));
            }}
            empty="No pursuit workflow has been assigned."
          />
        ) : null}
        {tab === "activity" ? (
          <StaffActivities
            activities={activities}
            onAdd={() => setDialog("activity")}
          />
        ) : null}

        {contact !== undefined ? (
          <ContactDialog
            open
            organizationId={lead.organization_id}
            staffLeadId={leadId}
            contact={contact}
            onClose={() => setContact(undefined)}
            onSaved={async () => {
              setContacts(await listOwnedLeadContacts(leadId));
              setContact(undefined);
            }}
          />
        ) : null}

        {dialog === "activity" ? (
          <LogActivityDialog
            contacts={contacts}
            onClose={() => setDialog(null)}
            onConfirm={async (input) => {
              await createLeadActivity(leadId, input, true);
              await refresh();
              setDialog(null);
              setSuccess("Activity recorded.");
              setTab("activity");
            }}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function StaffOverview({
  lead,
  tasks,
  pursuit,
  onContinuePursuit,
  onOpenContacts,
  onLogActivity,
}: {
  lead: Lead;
  tasks: LeadTask[];
  pursuit: Pursuit | null;
  onContinuePursuit: () => void;
  onOpenContacts: () => void;
  onLogActivity: () => void;
}) {
  const preferredStepId = pursuit?.current_step_id;
  const preferredStep = pursuit?.steps.find((step) => step.id === preferredStepId);
  const currentStep =
    (preferredStep && (!preferredStep.completed || preferredStep.review_status === "RETAKE_REQUIRED") ? preferredStep : null) ??
    pursuit?.steps.find((step) => step.review_status === "RETAKE_REQUIRED") ??
    pursuit?.steps.find((step) => !step.completed) ??
    null;
  const openTasks = tasks.filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED");
  const overdueTasks = openTasks.filter((task) => isOverdue(task.due_at));
  const website = lead.organization_website?.trim() ?? "";
  const websiteHref = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null;

  return (
    <div className={styles.workspaceSection}>
      <Card className={styles.nextActionCard}>
        <div className={styles.nextActionIntro}>
          <span className={styles.nextActionIcon} aria-hidden="true">↗</span>
          <div>
            <span className="eyebrow">Your next move</span>
            <h2>{currentStep ? `Continue ${currentStep.title}` : "Keep this relationship moving"}</h2>
            <p>
              {currentStep?.description || currentStep?.guidance ||
                (pursuit?.steps.length
                  ? "The configured pursuit stages are complete. Review the record and follow the next action agreed with your team."
                  : "No pursuit workflow is assigned yet. Check the organization context and record the next useful interaction.")}
            </p>
          </div>
        </div>
        <div className={styles.nextActionStats}>
          <div><span>Open tasks</span><strong>{openTasks.length}</strong></div>
          <div className={overdueTasks.length ? styles.nextActionDanger : ""}><span>Overdue tasks</span><strong>{overdueTasks.length}</strong></div>
          <div><span>Next follow-up</span><strong>{lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : "Not scheduled"}</strong></div>
        </div>
        <div className={styles.nextActionFooter}>
          <div className={styles.nextActionStageMeta}>
            {currentStep ? <Badge tone={currentStep.review_status === "RETAKE_REQUIRED" ? "danger" : "purple"}>{currentStep.review_status === "RETAKE_REQUIRED" ? "Retake required" : `Stage ${currentStep.position} of ${pursuit?.steps.length ?? 0}`}</Badge> : <Badge tone="neutral">No active stage</Badge>}
            <span>{lead.next_action || (currentStep ? "Complete the stage requirements and submit for review." : "Choose a useful next action for this organization.")}</span>
          </div>
          <div className={styles.nextActionButtons}>
            {pursuit?.steps.length ? <Button onClick={onContinuePursuit}>{currentStep ? "Open current stage" : "Review pursuit"}</Button> : null}
            <Button variant="outline" onClick={onOpenContacts}>View contacts</Button>
            <Button variant="ghost" onClick={onLogActivity}>Log activity</Button>
          </div>
        </div>
      </Card>

      <Card className={styles.workspaceCard}>
        <header className={styles.workspaceHeader}>
          <div>
            <span className="eyebrow">Record context</span>
            <h2>Lead overview</h2>
            <p>Organization context, ownership, next action and commercial pursuit in one working view.</p>
          </div>
        </header>
        <dl className={styles.overviewGrid}>
          <div className={styles.overviewItem}><dt>Organization</dt><dd>{lead.organization_name}</dd></div>
          <div className={styles.overviewItem}><dt>Current stage</dt><dd>{lead.stage.replaceAll("_", " ")}</dd></div>
          <div className={styles.overviewItem}><dt>Priority</dt><dd><LeadPriorityPill priority={lead.priority} /></dd></div>
          <div className={styles.overviewItem}><dt>Assignment source</dt><dd>{lead.claimed_by_id ? "Self-selected from Lead Pool" : lead.assigned_team_id ? `Team · ${lead.assigned_team_name || "Assigned team"}` : "Admin assigned"}</dd></div>
          <div className={styles.overviewItem}><dt>Assignment deadline</dt><dd className={isOverdue(lead.current_assignment_due_at) ? styles.dueOverdue : ""}>{lead.current_assignment_due_at ? formatDate(lead.current_assignment_due_at) : "—"}</dd></div>
          <div className={styles.overviewItem}><dt>Next action</dt><dd>{lead.next_action || "—"}</dd></div>
          <div className={styles.overviewItem}><dt>Website</dt><dd>{websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer">{website}</a> : "—"}</dd></div>
          <div className={styles.overviewItem}><dt>Organization email</dt><dd>{lead.organization_email ? <a href={`mailto:${lead.organization_email}`}>{lead.organization_email}</a> : "—"}</dd></div>
          <div className={styles.overviewItem}><dt>Organization phone</dt><dd>{lead.organization_phone ? <a href={`tel:${lead.organization_phone}`}>{lead.organization_phone}</a> : "—"}</dd></div>
        </dl>
      </Card>

      <Card className={styles.workspaceCard}>
        <header className={styles.workspaceHeader}>
          <div>
            <span className="eyebrow">Assigned work</span>
            <h2>Lead tasks</h2>
            <p>Complete the work connected to this Lead without losing the organization context.</p>
          </div>
          <Link className={styles.sectionLink} href="/tasks">Open all tasks →</Link>
        </header>
        {tasks.length ? (
          <div className={styles.taskList}>
            {tasks.map((task) => (
              <div className={styles.workspaceTask} key={task.id}>
                <div className={styles.workspaceTaskMain}>
                  <Link href={`/tasks/${task.id}`}><strong>{task.title}</strong></Link>
                  <span>{prettyStatus(task.status)}{task.due_at ? ` · due ${formatDate(task.due_at)}` : " · no deadline"}</span>
                </div>
                <div className={styles.workspaceTaskSide}>
                  {task.due_at && isOverdue(task.due_at) && task.status !== "COMPLETED" && task.status !== "CANCELLED" ? <Badge tone="danger">Overdue</Badge> : null}
                  <Badge tone={task.status === "COMPLETED" ? "success" : task.priority === "HIGH" || task.priority === "URGENT" ? "warning" : "neutral"}>{prettyStatus(task.status)}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyTaskMessage}>No Lead tasks are assigned to you.</p>
        )}
      </Card>
    </div>
  );
}

function StaffPursuit({
  leadId,
  pursuit,
  steps,
  contacts,
  onChanged,
  empty,
}: {
  leadId: string;
  pursuit: Pursuit | null;
  steps: PursuitStep[];
  contacts: Contact[];
  onChanged: (value: Pursuit) => Promise<void>;
  empty: string;
}) {
  const preferredStepId = pursuit?.current_step_id;
  const preferredStep = pursuit?.steps.find((step) => step.id === preferredStepId);
  const activeStepId =
    preferredStep && (!preferredStep.completed || preferredStep.review_status === "RETAKE_REQUIRED")
      ? preferredStep.id
      : steps.find((step) => !step.completed || step.review_status === "RETAKE_REQUIRED")?.id ?? null;
  const currentStepId = activeStepId && steps.some((step) => step.id === activeStepId) ? activeStepId : null;
  const [selectedStepId, setSelectedStepId] = useState<string | null>(currentStepId ?? steps[0]?.id ?? null);

  if (!pursuit || !steps.length) {
    return (
      <Card>
        <EmptyState icon="workflow" title="No available pursuit stage" description={empty} />
      </Card>
    );
  }

  const selectedStep = steps.find((step) => step.id === selectedStepId) ?? steps.find((step) => step.id === currentStepId) ?? steps[0]!;
  const completedCount = steps.filter((step) => step.completed).length;
  const currentStep = steps.find((step) => step.id === currentStepId) ?? null;

  async function handleChanged(updated: Pursuit) {
    await onChanged(updated);
    const updatedCurrent = updated.steps.find((step) => step.id === updated.current_step_id);
    const nextCurrentId =
      updatedCurrent && (!updatedCurrent.completed || updatedCurrent.review_status === "RETAKE_REQUIRED")
        ? updatedCurrent.id
        : updated.steps.find((step) => !step.completed || step.review_status === "RETAKE_REQUIRED")?.id;
    if (nextCurrentId && steps.some((step) => step.id === nextCurrentId)) {
      setSelectedStepId(nextCurrentId);
    }
  }

  function stateFor(step: PursuitStep): PursuitStageState {
    if (step.review_status === "RETAKE_REQUIRED") return "retake";
    if (step.completed) return "complete";
    if (step.id === currentStepId) return "current";
    return "locked";
  }

  const selectedState = stateFor(selectedStep);

  return (
    <div className={styles.pursuitWrap}>
      <div className={styles.pursuitOverviewBar}>
        <div>
          <span className="eyebrow">Configured workflow</span>
          <h2>{pursuit.workflow_name || "Lead pursuit"}</h2>
          <p>{pursuit.workflow_description || "Work through the stages in order. Each stage keeps its response, comments, evidence and task requirements together."}</p>
        </div>
        <div className={styles.pursuitProgressSummary}>
          <strong>{completedCount}<span> / {steps.length}</span></strong>
          <span>stages completed</span>
          <div className={styles.pursuitMiniTrack}><span style={{ width: `${steps.length ? (completedCount / steps.length) * 100 : 0}%` }} /></div>
        </div>
      </div>

      <div className={styles.stageNavigator} aria-label="Pursuit stages">
        {steps.map((step) => {
          const state = stateFor(step);
          const selected = step.id === selectedStep.id;
          const canOpen = state === "complete" || step.id === currentStepId;
          const stateLabel = state === "retake" ? "Retake" : state === "complete" ? "Complete" : state === "current" ? "Current" : "Locked";
          return (
            <button
              key={step.id}
              type="button"
              className={`${styles.stageNavItem} ${pursuitStageStateClasses[state]} ${selected ? styles.stageNavSelected : ""}`}
              aria-current={selected ? "step" : undefined}
              aria-disabled={!canOpen}
              disabled={!canOpen}
              onClick={() => setSelectedStepId(step.id)}
              title={canOpen ? `View ${step.title}` : "Complete the current stage before opening this stage."}
            >
              <span className={styles.stageNavNumber}>{state === "complete" ? "✓" : state === "retake" ? "!" : step.position}</span>
              <span className={styles.stageNavText}><strong>{step.title}</strong><small>{stateLabel}</small></span>
            </button>
          );
        })}
      </div>

      <p className={styles.pursuitHint}>
        {selectedState === "locked"
          ? "This stage is locked until the active stage is submitted and its transition requirements are satisfied."
          : selectedState === "complete"
            ? "You are viewing a completed stage. Its saved response and evidence are read-only."
            : selectedState === "retake" && selectedStep.id !== currentStepId
              ? "Admin requested a retake for this stage. Open the active Pursuit stage to continue the workflow."
              : selectedState === "retake"
                ? "Admin requested a retake. Review the reason and update the required response before submitting again."
                : "This is your active stage. Complete the configured fields, evidence, comments and blocking tasks before submitting."}
      </p>

      {selectedState === "locked" ? (
        <Card className={styles.lockedStageCard}>
          <div className={styles.lockedStageIcon} aria-hidden="true">🔒</div>
          <div><h3>{selectedStep.title}</h3><p>{selectedStep.description || "This stage becomes available after the previous stage is submitted."}</p></div>
          <Badge tone="neutral">Locked</Badge>
        </Card>
      ) : (
        <PursuitStageForm
          key={selectedStep.id}
          leadId={leadId}
          step={selectedStep}
          contacts={contacts}
          current={selectedStep.id === currentStepId}
          onChanged={handleChanged}
        />
      )}

      {steps.length > 1 && currentStep ? (
        <div className={styles.currentStageCallout}>
          <span className={styles.currentStagePulse} aria-hidden="true" />
          <div><strong>Active stage: {currentStep.title}</strong><span>Return to this stage to continue the live workflow.</span></div>
          {selectedStep.id !== currentStep.id ? <Button size="sm" variant="outline" onClick={() => setSelectedStepId(currentStep.id)}>Back to active stage</Button> : null}
        </div>
      ) : null}

      {steps.length > 1 ? <PursuitTimeline pursuit={pursuit} /> : null}
    </div>
  );
}

function PursuitTimeline({ pursuit }: { pursuit: Pursuit }) {
  const events = [...(pursuit.timeline ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <Card className={styles.workspaceCard}>
      <header className={styles.workspaceHeader}>
        <div><span className="eyebrow">Workflow history</span><h2>Pursuit timeline</h2><p>Stage submissions, reviews, comments and other workflow events recorded against this pursuit.</p></div>
      </header>
      {events.length ? (
        <ol className={styles.pursuitTimeline}>
          {events.map((event) => (
            <li key={event.id} className={styles.pursuitTimelineItem}>
              <span className={styles.pursuitTimelineDot} aria-hidden="true" />
              <div className={styles.pursuitTimelineMain}>
                <div className={styles.pursuitTimelineTop}><strong>{prettyStatus(event.event_type)}</strong><time dateTime={event.created_at}>{formatDate(event.created_at)}</time></div>
                <p>{event.message || "Workflow event recorded."}</p>
                <small>{[event.actor_first_name, event.actor_last_name].filter(Boolean).join(" ") || "PlanoraHub system"}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.emptyTaskMessage}>No pursuit timeline events have been recorded yet.</p>
      )}
    </Card>
  );
}

function StaffContacts({
  contacts,
  onAdd,
  onEdit,
  onVerify,
}: {
  contacts: Contact[];
  onAdd: () => void;
  onEdit: (contact: Contact) => void;
  onVerify: (contact: Contact, method: Contact["methods"][number], status: "UNVERIFIED" | "VERIFIED" | "INVALID") => Promise<void>;
}) {
  return (
    <Card className={styles.workspaceCard}>
      <header className={styles.workspaceHeader}>
        <div>
          <span className="eyebrow">People at this organization</span>
          <h2>Organization contacts</h2>
          <p>Keep decision-makers and verified contact methods ready for the next pursuit action.</p>
        </div>
        <Button onClick={onAdd}>+ Add Contact</Button>
      </header>

      {contacts.length ? (
        <div className={styles.contactList}>
          {contacts.map((contact) => (
            <article key={contact.id} className={styles.contactCard}>
              <div className={styles.contactHead}>
                <div className={styles.contactIdentity}>
                  <strong>{contact.first_name} {contact.last_name}</strong>
                  <span>{contact.job_title || "Role not provided"}{contact.is_primary ? " · Primary contact" : ""}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => onEdit(contact)}>Edit</Button>
              </div>

              {contact.methods.length ? (
                <div className={styles.methodGrid}>
                  {contact.methods.map((method) => (
                    <div key={method.id} className={styles.methodCard}>
                      <div className={styles.methodTop}>
                        <span className={styles.methodLabel}>{method.label || methodTypeLabel(method.type)}</span>
                        <Badge tone={method.verification_status === "VERIFIED" ? "success" : method.verification_status === "INVALID" ? "danger" : "neutral"}>
                          {method.verification_status}
                        </Badge>
                      </div>
                      <span className={styles.methodValue}>{method.value}</span>
                      <div className={styles.methodActions}>
                        {method.verification_status !== "VERIFIED" ? <button type="button" className={styles.methodAction} onClick={() => void onVerify(contact, method, "VERIFIED")}>Mark verified</button> : null}
                        {method.verification_status !== "INVALID" ? <button type="button" className={styles.methodAction} onClick={() => void onVerify(contact, method, "INVALID")}>Mark invalid</button> : <button type="button" className={styles.methodAction} onClick={() => void onVerify(contact, method, "UNVERIFIED")}>Restore</button>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No contact methods recorded.</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon="contacts" title="No contacts yet" description="Add the first relevant person for this organization." action={<Button onClick={onAdd}>+ Add Contact</Button>} />
      )}
    </Card>
  );
}

function StaffActivities({ activities, onAdd }: { activities: Activity[]; onAdd: () => void }) {
  return (
    <Card className={styles.workspaceCard}>
      <header className={styles.workspaceHeader}>
        <div>
          <span className="eyebrow">Shared history</span>
          <h2>Lead activity</h2>
          <p>Business interactions, outcomes and scheduled follow-ups recorded against this Lead.</p>
        </div>
        <Button onClick={onAdd}>+ Log Activity</Button>
      </header>

      {activities.length ? (
        <ol className={styles.activityList}>
          {activities.map((activity) => (
            <li key={activity.id} className={styles.activityItem}>
              <span className={styles.activityDot} aria-hidden="true" />
              <time className={styles.activityDate} dateTime={activity.scheduled_at || activity.completed_at || activity.created_at}>
                {formatDate(activity.scheduled_at || activity.completed_at || activity.created_at)}
              </time>
              <div className={styles.activityBody}>
                <div><Badge tone="neutral">{activity.activity_type.replace("_", " ")}</Badge></div>
                <strong className={styles.activityTitle}>{activity.title}</strong>
                {activity.description ? <p className={styles.activityDescription}>{activity.description}</p> : null}
                {activity.next_follow_up_at ? <p className={styles.activityFollowup}>Next follow-up · {formatDate(activity.next_follow_up_at)}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon="activity" title="No activity recorded" description="Log work or schedule a follow-up for this Lead." action={<Button onClick={onAdd}>+ Log Activity</Button>} />
      )}
    </Card>
  );
}
