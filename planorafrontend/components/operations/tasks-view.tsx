"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { PageErrorState, PageLoadingState } from "@/components/ui/page-state";
import { getCurrentCrmUser } from "@/lib/auth/current-user";
import { hasAdministrativeAccess } from "@/lib/auth/routing";
import { createTask, listAssignmentStaff, listContacts, listLeads, listOrganizations, listTasks, uploadTaskAttachment } from "@/lib/leads/api";
import { formatDate } from "@/lib/leads/helpers";
import type { AssignmentStaff, Lead, TaskDetail } from "@/lib/leads/types";
import { listTaskWorkflows, type TaskWorkflow } from "@/lib/workspace/api";

type TaskFilter = "ALL" | "TODAY" | "OVERDUE" | "COMPLETED";
type OrganizationOption = { id: string; name: string };
type ContactOption = { id: string; organization_id: string; organization_name: string; first_name: string; last_name: string; job_title: string | null };

export function TasksView() {
  const [staff, setStaff] = useState<boolean | null>(null);
  const [rows, setRows] = useState<TaskDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskFilter>("ALL");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const user = await getCurrentCrmUser();
      const isStaff = !hasAdministrativeAccess(user);
      setStaff(isStaff);
      setRows(await listTasks(isStaff));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load tasks.");
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = todayStart + 86_400_000;
  const assignees = useMemo(() => [...new Set(rows.map((task) => personName(task.assignee_first_name, task.assignee_last_name)).filter((name) => name !== "Unassigned"))].sort(), [rows]);
  const counts = useMemo(() => {
    let today = 0, overdue = 0, completed = 0;
    for (const task of rows) {
      if (task.status === "COMPLETED") { completed += 1; continue; }
      const due = task.due_at ? new Date(task.due_at).getTime() : null;
      if (due !== null && due < todayStart) overdue += 1;
      else if (due !== null && due >= todayStart && due < tomorrowStart) today += 1;
    }
    return { all: rows.length, today, overdue, completed };
  }, [rows, todayStart, tomorrowStart]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((task) => {
      const due = task.due_at ? new Date(task.due_at).getTime() : null;
      const isCompleted = task.status === "COMPLETED";
      const isOverdue = !isCompleted && due !== null && due < todayStart;
      const isToday = !isCompleted && due !== null && due >= todayStart && due < tomorrowStart;
      if (filter === "TODAY" && !isToday) return false;
      if (filter === "OVERDUE" && !isOverdue) return false;
      if (filter === "COMPLETED" && !isCompleted) return false;
      if (status !== "ALL" && task.status !== status) return false;
      const name = personName(task.assignee_first_name, task.assignee_last_name);
      if (assignee !== "ALL" && name !== assignee) return false;
      return !needle || [task.title, task.description, task.lead_title, task.organization_name, name, task.task_workflow_name].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [rows, search, status, assignee, filter, todayStart, tomorrowStart]);

  if (error) return <AppShell area={staff ? "staff" : "admin"} title="Tasks" breadcrumb="Work"><PageErrorState message={error} /></AppShell>;
  if (staff === null) return <main><PageLoadingState /></main>;

  return <AppShell area={staff ? "staff" : "admin"} title="Tasks" breadcrumb="Work" description={staff ? "Your assigned work, deadlines and delivery status in one focused workspace." : "Assign clear work across every department and monitor delivery without unnecessary complexity."} actions={!staff ? <><Link href="/task-workflows"><Button variant="outline">Task Workflows</Button></Link><Button onClick={() => setCreateOpen(true)}>+ New Task</Button></> : undefined}>
    <div className="tasks-page">
      <div className="task-summary-grid"><TaskMetric label="All tasks" value={counts.all} active={filter === "ALL"} onClick={() => setFilter("ALL")} /><TaskMetric label="Due today" value={counts.today} active={filter === "TODAY"} onClick={() => setFilter("TODAY")} /><TaskMetric label="Overdue" value={counts.overdue} tone="danger" active={filter === "OVERDUE"} onClick={() => setFilter("OVERDUE")} /><TaskMetric label="Completed" value={counts.completed} tone="success" active={filter === "COMPLETED"} onClick={() => setFilter("COMPLETED")} /></div>
      <Card className="workspace-card tasks-card">
        <div className="tasks-toolbar polished-toolbar">
          <div className="tasks-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search title, person, organization or workflow…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <NativeSelect aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="AWAITING_RESPONSE">Submitted for review</option><option value="BLOCKED">Needs revision / blocked</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></NativeSelect>
          {!staff ? <NativeSelect aria-label="Filter by assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="ALL">All assignees</option>{assignees.map((name) => <option key={name} value={name}>{name}</option>)}</NativeSelect> : null}
        </div>
        {filtered.length ? <div className="tasks-table-wrap"><table className="tasks-table"><thead><tr><th>Task</th><th>Context</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Due</th><th /></tr></thead><tbody>{filtered.map((task) => <tr key={task.id}><td><div className="task-title-cell"><strong>{task.title}</strong>{task.task_workflow_name ? <span>Workflow · {task.task_workflow_name}</span> : task.lead_assignment_batch ? <span>Lead assignment</span> : task.description ? <span>{task.description}</span> : <span>General task</span>}</div></td><td>{task.lead_title || task.organization_name || "Internal / General"}</td><td>{personName(task.assignee_first_name, task.assignee_last_name)}</td><td><Badge tone={priorityTone(task.priority)}>{humanize(task.priority)}</Badge></td><td><Badge tone={statusTone(task.status)}>{humanize(task.status)}</Badge></td><td className={isTaskOverdue(task) ? "overdue-text" : ""}>{task.due_at ? formatDate(task.due_at) : "No deadline"}</td><td className="tasks-action-cell"><Link className="tasks-open-link" href={`/tasks/${task.id}`}>Open →</Link></td></tr>)}</tbody></table></div> : <EmptyState icon="tasks" title="No matching tasks" description={rows.length ? "Try changing the filters or search." : "Create a task to start coordinating company work."} />}
      </Card>
    </div>
    {!staff ? <CreateTaskModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await load(); }} /> : null}
  </AppShell>;
}

function CreateTaskModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [people, setPeople] = useState<AssignmentStaff[]>([]); const [leads, setLeads] = useState<Lead[]>([]); const [organizations, setOrganizations] = useState<OrganizationOption[]>([]); const [contacts, setContacts] = useState<ContactOption[]>([]); const [workflows, setWorkflows] = useState<TaskWorkflow[]>([]);
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [assignedToId, setAssignedToId] = useState(""); const [relationType, setRelationType] = useState("NONE"); const [relationId, setRelationId] = useState(""); const [workflowId, setWorkflowId] = useState(""); const [priority, setPriority] = useState("MEDIUM"); const [dueAt, setDueAt] = useState(""); const [files, setFiles] = useState<File[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!open) return; void Promise.all([listAssignmentStaff(), listLeads(), listOrganizations(), listContacts(), listTaskWorkflows()]).then(([staffRows, leadRows, orgRows, contactRows, workflowRows]) => { setPeople(staffRows.filter((p) => p.status === "ACTIVE" || p.status === "INVITED")); setLeads(leadRows); setOrganizations(orgRows); setContacts(contactRows); setWorkflows(workflowRows); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load task options.")); }, [open]);
  const selectedLead = relationType === "LEAD" ? leads.find((lead) => lead.id === relationId) : undefined; const selectedContact = relationType === "CONTACT" ? contacts.find((contact) => contact.id === relationId) : undefined; const selectedWorkflow = workflows.find((w) => w.id === workflowId);
  return <Modal open={open} onClose={onClose} title="Create task"><form className="task-form task-form--premium" onSubmit={async (event) => { event.preventDefault(); if (!title.trim()) return setError("Task title is required."); if (relationType === "WORKFLOW" && !workflowId) return setError("Select a task workflow guide."); setSaving(true); setError(null); try { const created = await createTask({ title:title.trim(), description:description.trim()||null, assignedToId:assignedToId||null, priority, dueAt:dueAt?new Date(dueAt).toISOString():null, taskWorkflowId: relationType === "WORKFLOW" ? workflowId : null, leadId:relationType === "LEAD"?relationId||null:null, organizationId:relationType === "ORGANIZATION"?relationId||null:selectedLead?.organization_id??selectedContact?.organization_id??null, contactId:relationType === "CONTACT"?relationId||null:null }); for (const file of files) await uploadTaskAttachment(created.id,file,false); await onCreated(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create task."); setSaving(false); } }}>
    <div className="task-form-intro"><span className="task-form-kicker">Work brief</span><p>Keep the brief clear: who owns it, when it is due, and which process guide applies.</p></div>
    <label className="ui-field"><span className="ui-label">Task title *</span><input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Prepare September campaign performance report" /></label>
    <label className="ui-field"><span className="ui-label">Instructions</span><textarea className="ui-input" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should be delivered? Add acceptance notes or context here." /></label>
    <div className="task-form-grid"><NativeSelect label="Assign to" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}><option value="">Unassigned</option>{people.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}{person.job_title ? ` · ${person.job_title}` : ""}</option>)}</NativeSelect><NativeSelect label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></NativeSelect></div>
    <div className="task-form-grid"><NativeSelect label="Related to" value={relationType} onChange={(e) => { setRelationType(e.target.value); setRelationId(""); setWorkflowId(""); }}><option value="NONE">Nothing / general task</option><option value="WORKFLOW">Task workflow / internal process</option><option value="LEAD">Lead</option><option value="ORGANIZATION">Organization</option><option value="CONTACT">Contact</option></NativeSelect><label className="ui-field"><span className="ui-label">Due date</span><input className="ui-input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label></div>
    {relationType === "WORKFLOW" ? <><NativeSelect label="Workflow guide" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}><option value="">Select a workflow…</option>{workflows.map((w) => <option key={w.id} value={w.id}>{w.name}{w.category ? ` · ${w.category}` : ""}</option>)}</NativeSelect>{selectedWorkflow ? <div className="workflow-preview"><strong>{selectedWorkflow.name}</strong><span>{selectedWorkflow.description || "Reusable company work guide"}</span><ol>{selectedWorkflow.steps.slice(0,6).map((step) => <li key={step.id}>{step.title}</li>)}</ol>{selectedWorkflow.steps.length>6?<small>+ {selectedWorkflow.steps.length-6} more steps</small>:null}</div> : null}</> : null}
    {relationType !== "NONE" && relationType !== "WORKFLOW" ? <NativeSelect label={`Select ${relationType.toLowerCase()}`} value={relationId} onChange={(e) => setRelationId(e.target.value)}><option value="">Select…</option>{relationType === "LEAD" ? leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.organization_name} — {lead.title}</option>) : relationType === "ORGANIZATION" ? organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>) : contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.first_name} {contact.last_name} — {contact.organization_name}</option>)}</NativeSelect> : null}
    <label className="task-upload-zone"><input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files??[]))} /><span className="task-upload-icon">↑</span><strong>Attach task files</strong><small>{files.length ? `${files.length} file${files.length===1?"":"s"} selected` : "PDF, images, Word, Excel or text · up to 10 MB each"}</small></label>
    {files.length ? <div className="file-chip-row">{files.map((file) => <span className="file-chip" key={`${file.name}-${file.size}`}>{file.name}</span>)}</div> : null}
    {error ? <p className="task-form-error">{error}</p> : null}<div className="task-form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>{saving && files.length ? "Creating & uploading…" : "Create task"}</Button></div>
  </form></Modal>;
}

function TaskMetric({ label, value, active, tone, onClick }: { label: string; value: number; active: boolean; tone?: "danger" | "success"; onClick: () => void }) { return <button type="button" className={["task-metric", active ? "is-active" : "", tone ? `is-${tone}` : ""].filter(Boolean).join(" ")} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>; }
function personName(first: string | null, last: string | null) { return [first, last].filter(Boolean).join(" ") || "Unassigned"; }
function humanize(value: string) { if(value==="AWAITING_RESPONSE") return "Submitted for Review"; if(value==="BLOCKED") return "Needs Revision / Blocked"; return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function priorityTone(priority: string) { if (priority === "URGENT") return "danger" as const; if (priority === "HIGH") return "warning" as const; return "neutral" as const; }
function statusTone(status: string) { if (status === "COMPLETED") return "success" as const; if (status === "CANCELLED") return "danger" as const; if (status === "IN_PROGRESS") return "purple" as const; if(status === "AWAITING_RESPONSE") return "info" as const; return "neutral" as const; }
function isTaskOverdue(task:TaskDetail){return Boolean(task.due_at&&!["COMPLETED","CANCELLED"].includes(task.status)&&new Date(task.due_at).getTime()<Date.now())}
