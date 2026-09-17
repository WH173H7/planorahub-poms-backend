"use client";

import Link from "next/link";
import {
  type ChangeEvent,
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
import { Textarea } from "@/components/ui/textarea";
import {
  changeLeadStage,
  createLeadActivity,
  getOwnedLead,
  getOwnedLeadPursuit,
  listOwnedLeadActivities,
  listOwnedLeadContacts,
  listOwnedLeadTasks,
  updateOwnedContactMethod,
  updateOwnedPursuitStep,
  uploadOwnedPursuitEvidence,
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
import {
  ChangeStageDialog,
  LogActivityDialog,
} from "./lead-operations-dialogs";
import { LeadPriorityPill, LeadStagePill } from "./lead-status";

type Tab = "overview" | "research" | "contacts" | "pursuit" | "activity";

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
  const [dialog, setDialog] = useState<"stage" | "activity" | null>(null);
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
  return (
    <AppShell
      area="staff"
      title={lead.organization_name}
      breadcrumb="My Work / Assigned Leads"
    >
      <div className="lead-workspace">
        <Link href="/my-work" className="back-link">
          ← My Work
        </Link>
        {success ? <Alert tone="success">{success}</Alert> : null}
        <Card className="record-header">
          <div className="record-title">
            <div>
              <span className="eyebrow">Assigned organization lead</span>
              <h1>{lead.organization_name}</h1>
              <p>
                {[lead.industry, organizationLocation(lead)]
                  .filter(Boolean)
                  .join(" · ") || "Organization pursuit"}
              </p>
            </div>
            <div className="record-header-actions">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog("stage")}
              >
                Change Stage
              </Button>
              <Button size="sm" onClick={() => setDialog("activity")}>
                + Log Activity
              </Button>
            </div>
          </div>
          <div className="record-meta">
            <div>
              <span className="record-meta-label">Stage</span>
              <LeadStagePill stage={lead.stage} />
            </div>
            <div>
              <span className="record-meta-label">Owner</span>
              <div>{ownerName(lead)}</div>
            </div>
            <div>
              <span className="record-meta-label">Assignment source</span>
              <div className="lead-routing-value">
                {lead.claimed_by_id ? (
                  <><Badge tone="purple">Lead Pool</Badge><span>Self-selected by you</span></>
                ) : lead.assigned_team_id ? (
                  <><Badge tone="neutral">Team</Badge><span>{lead.assigned_team_name || 'Team assignment'}</span></>
                ) : (
                  <><Badge tone="neutral">Assigned</Badge><span>Admin assigned</span></>
                )}
              </div>
            </div>
            <div>
              <span className="record-meta-label">Priority</span>
              <LeadPriorityPill priority={lead.priority} />
            </div>
            <div>
              <span className="record-meta-label">Progress</span>
              <div>{lead.pursuit_progress}%</div>
              <Progress value={lead.pursuit_progress} />
            </div>
            <div>
              <span className="record-meta-label">Next follow-up</span>
              <div>
                {lead.next_follow_up_at
                  ? formatDate(lead.next_follow_up_at)
                  : "—"}
              </div>
            </div>
          </div>
        </Card>
        <div className="record-tabs" role="tablist">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "overview" ? (
          <StaffOverview lead={lead} tasks={tasks} />
        ) : null}
        {tab === "research" ? (
          <StaffPursuit
            leadId={leadId}
            pursuit={pursuit}
            steps={research ? [research] : []}
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
            onVerify={async (contact, method, verificationStatus) => {
              await updateOwnedContactMethod(leadId, contact.id, method.id, {
                type: method.type,
                value: method.value,
                label: method.label,
                notes: method.notes,
                isPrimary: method.is_primary,
                verificationStatus,
              });
              setContacts(await listOwnedLeadContacts(leadId));
            }}
            contactFoundReady={
              lead.stage === "RESEARCHING" &&
              contacts.some((person) =>
                person.methods.some(
                  (method) =>
                    method.verification_status === "VERIFIED" &&
                    ["EMAIL", "PHONE", "LINKEDIN", "X", "INSTAGRAM", "FACEBOOK"].includes(method.type),
                ),
              )
            }
            onMoveToContactFound={() => setDialog("stage")}
          />
        ) : null}
        {tab === "pursuit" ? (
          <StaffPursuit
            leadId={leadId}
            pursuit={pursuit}
            steps={pursuit?.steps ?? []}
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
        {dialog === "stage" ? (
          <ChangeStageDialog
            stage={lead.stage}
            onClose={() => setDialog(null)}
            onConfirm={async (stage, reason, expectedRevenue) => {
              await changeLeadStage(leadId, { stage, reason, expectedRevenue }, true);
              await refresh();
              setDialog(null);
              setSuccess("Lead stage updated.");
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

function StaffOverview({ lead, tasks }: { lead: Lead; tasks: LeadTask[] }) {
  return (
    <>
      <Card className="workspace-card">
        <header>
          <div>
            <h2>Lead overview</h2>
            <p>
              Keep organization research, pursuit progress, contacts and next actions together. Commercial value is introduced only when you recommend the Lead for Prospect Review.
            </p>
          </div>
        </header>
        <dl className="detail-grid">
          <div>
            <dt>Organization</dt>
            <dd>{lead.organization_name}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>{lead.stage.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Assignment source</dt>
            <dd>{lead.claimed_by_id ? 'Self-selected from Lead Pool' : lead.assigned_team_id ? `Team · ${lead.assigned_team_name || 'Assigned team'}` : 'Admin assigned'}</dd>
          </div>
          <div>
            <dt>Assignment deadline</dt>
            <dd>
              {lead.current_assignment_due_at
                ? formatDate(lead.current_assignment_due_at)
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Next action</dt>
            <dd>{lead.next_action || "—"}</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>{lead.organization_website || "—"}</dd>
          </div>
          <div>
            <dt>Organization email</dt>
            <dd>{lead.organization_email || "—"}</dd>
          </div>
        </dl>
      </Card>
      <Card className="workspace-card">
        <header>
          <div>
            <h2>Lead tasks</h2>
            <p>Actionable work assigned to you for this Lead.</p>
          </div>
        </header>
        {tasks.length ? (
          <ul>
            {tasks.map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong> ·{" "}
                {task.status.replaceAll("_", " ")} · due{" "}
                {task.due_at ? formatDate(task.due_at) : "—"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No Lead tasks assigned to you.</p>
        )}
      </Card>
    </>
  );
}

function StaffPursuit({
  leadId,
  pursuit,
  steps,
  onChanged,
  empty,
}: {
  leadId: string;
  pursuit: Pursuit | null;
  steps: PursuitStep[];
  onChanged: (value: Pursuit) => Promise<void>;
  empty: string;
}) {
  if (!pursuit || !steps.length)
    return (
      <Card>
        <EmptyState
          icon="workflow"
          title="No available step"
          description={empty}
        />
      </Card>
    );
  return (
    <div className="pursuit-list">
      {steps.map((step) => (
        <StaffStep
          key={step.id}
          leadId={leadId}
          step={step}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function StaffStep({
  leadId,
  step,
  onChanged,
}: {
  leadId: string;
  step: PursuitStep;
  onChanged: (value: Pursuit) => Promise<void>;
}) {
  const [notes, setNotes] = useState(step.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save(completed = step.completed) {
    setSaving(true);
    setMessage(null);
    try {
      await onChanged(
        await updateOwnedPursuitStep(leadId, step.id, {
          completed,
          notes: notes || null,
        }),
      );
      setMessage("Pursuit step updated.");
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Unable to update step.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      await uploadOwnedPursuitEvidence(leadId, step.id, file);
      const updated = await getOwnedLeadPursuit(leadId);
      if (updated) await onChanged(updated);
      setMessage("Evidence uploaded.");
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Evidence upload failed.",
      );
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }
  return (
    <Card className="workspace-card step-card">
      <header>
        <div>
          <span className="eyebrow">Step {step.position}</span>
          <h2>{step.title}</h2>
          <p>{step.description || "No description provided."}</p>
        </div>
        <Badge tone={step.completed ? "success" : "neutral"}>
          {step.completed ? "Complete" : "Incomplete"}
        </Badge>
      </header>
      <Textarea
        label="Working notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={5}
      />
      <div className="evidence-block">
        <strong>
          Evidence {step.evidence_required ? "required" : "optional"}
        </strong>
        {step.evidence.length ? (
          <ul>
            {step.evidence.map((file) => (
              <li key={file.id}>
                {file.file_name} · {formatDate(file.created_at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No evidence uploaded.</p>
        )}
        <label className="ui-button ui-button--outline ui-button--sm evidence-upload">
          Upload evidence
          <input type="file" onChange={upload} disabled={saving} />
        </label>
      </div>
      {message ? (
        <Alert
          tone={
            message.includes("Unable") || message.includes("failed")
              ? "error"
              : "success"
          }
        >
          {message}
        </Alert>
      ) : null}
      <footer>
        <Button variant="outline" onClick={() => void save()} loading={saving}>
          Save notes
        </Button>
        <Button onClick={() => void save(!step.completed)} loading={saving}>
          {step.completed ? "Reopen step" : "Mark complete"}
        </Button>
      </footer>
    </Card>
  );
}

function StaffContacts({
  contacts,
  onAdd,
  onEdit,
  onVerify,
  contactFoundReady,
  onMoveToContactFound,
}: {
  contacts: Contact[];
  onAdd: () => void;
  onEdit: (contact: Contact) => void;
  onVerify: (contact:Contact,method:Contact["methods"][number],status:"UNVERIFIED"|"VERIFIED"|"INVALID")=>Promise<void>;
  contactFoundReady:boolean;
  onMoveToContactFound:()=>void;
}) {
  return (
    <Card className="workspace-card">
      <header>
        <div>
          <h2>Organization contacts</h2>
          <p>People and normalized contact methods for this organization.</p>
        </div>
        <Button onClick={onAdd}>+ Add Contact</Button>
      </header>
      {contactFoundReady ? <Alert tone="success">Contact information is ready. <Button size="sm" onClick={onMoveToContactFound}>Move Lead to Contact Found</Button></Alert> : null}
      {contacts.length ? (
        <div className="contact-list">
          {contacts.map((contact) => (
            <article key={contact.id}>
              <div className="contact-heading">
                <div>
                  <strong>
                    {contact.first_name} {contact.last_name}
                  </strong>
                  <p>{contact.job_title || "Role not provided"}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(contact)}
                >
                  Edit
                </Button>
              </div>
              {contact.methods.length ? (
                <dl className="contact-method-list">
                  {contact.methods.map((method) => (
                    <div key={method.id}>
                      <dt>{method.label || methodTypeLabel(method.type)}</dt>
                      <dd>
                        <span>{method.value}</span>
                        <Badge
                          tone={
                            method.verification_status === "VERIFIED"
                              ? "success"
                              : method.verification_status === "INVALID"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {method.verification_status}
                        </Badge>
                        <span className="table-actions">
                          {method.verification_status !== "VERIFIED" ? <button type="button" onClick={()=>void onVerify(contact,method,"VERIFIED")}>Mark verified</button> : null}
                          {method.verification_status !== "INVALID" ? <button type="button" onClick={()=>void onVerify(contact,method,"INVALID")}>Mark invalid</button> : <button type="button" onClick={()=>void onVerify(contact,method,"UNVERIFIED")}>Restore</button>}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="muted">No contact methods recorded.</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="contacts"
          title="No contacts yet"
          description="Add the first relevant person for this organization."
          action={<Button onClick={onAdd}>+ Add Contact</Button>}
        />
      )}
    </Card>
  );
}

function StaffActivities({
  activities,
  onAdd,
}: {
  activities: Activity[];
  onAdd: () => void;
}) {
  return (
    <Card className="workspace-card">
      <header>
        <div>
          <h2>Lead activity</h2>
          <p>Business interactions and scheduled follow-ups.</p>
        </div>
        <Button onClick={onAdd}>+ Log Activity</Button>
      </header>
      {activities.length ? (
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
                <Badge tone="neutral">
                  {activity.activity_type.replace("_", " ")}
                </Badge>
                <strong>{activity.title}</strong>
                {activity.description ? <p>{activity.description}</p> : null}
                {activity.next_follow_up_at ? (
                  <p>
                    Next follow-up: {formatDate(activity.next_follow_up_at)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon="activity"
          title="No activity recorded"
          description="Log work or schedule a follow-up for this lead."
          action={<Button onClick={onAdd}>+ Log Activity</Button>}
        />
      )}
    </Card>
  );
}
