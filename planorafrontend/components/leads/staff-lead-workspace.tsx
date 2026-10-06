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

function StaffOverview({ lead, tasks }: { lead: Lead; tasks: LeadTask[] }) {
  return (
    <>
      <Card className="workspace-card">
        <header>
          <div>
            <h2>Lead overview</h2>
            <p>
              Keep organization research, pursuit progress, contacts and next actions together. Pursuit context is captured inside the configured stages; opportunity value is pipeline context and remains separate from realised revenue.
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
  if (!pursuit || !steps.length) {
    return (
      <Card>
        <EmptyState
          icon="workflow"
          title="No available pursuit stage"
          description={empty}
        />
      </Card>
    );
  }

  const currentStepId = pursuit.current_step_id ?? steps.find((step) => !step.completed)?.id ?? null;

  return (
    <div className="pursuit-list">
      {steps.map((step) => {
        const current = step.id === currentStepId;
        const locked = !step.completed && !current;
        return locked ? (
          <Card key={step.id} className="workspace-card pursuit-locked-stage">
            <header>
              <div>
                <span className="eyebrow">Stage {step.position}</span>
                <h2>{step.title}</h2>
                <p>{step.description || 'This stage becomes available after the previous stage is submitted.'}</p>
              </div>
              <Badge tone="neutral">Locked</Badge>
            </header>
            <p className="muted">Complete the current stage before working on this stage.</p>
          </Card>
        ) : (
          <PursuitStageForm
            key={step.id}
            leadId={leadId}
            step={step}
            contacts={contacts}
            current={current}
            onChanged={onChanged}
          />
        );
      })}
    </div>
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
  onVerify: (contact:Contact,method:Contact["methods"][number],status:"UNVERIFIED"|"VERIFIED"|"INVALID")=>Promise<void>;
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
