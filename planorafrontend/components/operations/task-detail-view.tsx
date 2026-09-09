"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageErrorState, PageLoadingState } from "@/components/ui/page-state";
import { getCurrentCrmUser } from "@/lib/auth/current-user";
import { hasAdministrativeAccess } from "@/lib/auth/routing";
import { deleteTask, getTask, updateTask, uploadTaskAttachment } from "@/lib/leads/api";
import { formatDate } from "@/lib/leads/helpers";
import { reviewTask, taskAccept, taskStart, taskSubmit } from "@/lib/delivery/api";
import { toggleTaskWorkflowStep } from "@/lib/workspace/api";
import type { TaskDetail } from "@/lib/leads/types";

const statusTone = (status: string): Tone => status === "COMPLETED" ? "success" : status === "BLOCKED" || status === "CANCELLED" ? "danger" : status === "IN_PROGRESS" ? "info" : "neutral";
const priorityTone = (priority: string): Tone => priority === "URGENT" ? "danger" : priority === "HIGH" ? "warning" : priority === "MEDIUM" ? "purple" : "neutral";
const pretty = (value: string) => value === "AWAITING_RESPONSE" ? "Submitted for Review" : value === "BLOCKED" ? "Needs Revision / Blocked" : value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
const person = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(" ") || "—";
const fileSize = (bytes: number | null) => bytes == null ? "" : bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function TaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [staff, setStaff] = useState<boolean | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const user = await getCurrentCrmUser();
      const isStaff = !hasAdministrativeAccess(user);
      setStaff(isStaff);
      setTask(await getTask(taskId, isStaff));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load task.");
    }
  }, [taskId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (staff === null) return <main><PageLoadingState /></main>;
  if (error || !task) return <AppShell area={staff ? "staff" : "admin"} title="Task" breadcrumb="Work / Tasks"><PageErrorState message={error || "Task not found."} /></AppShell>;

  const generated = Boolean(task.lead_assignment_batch);
  const assignmentItems = task.lead_assignment_batch?.items ?? [];
  const directRelated = Boolean(task.organization_id || task.lead_id || task.contact_id);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { await uploadTaskAttachment(taskId, file, Boolean(staff)); await load(); }
    finally { setUploading(false); event.target.value = ""; }
  }

  async function complete() {
    setCompleting(true);
    try { await updateTask(taskId, { status: "COMPLETED" }, Boolean(staff)); await load(); }
    finally { setCompleting(false); }
  }
  async function workflow(action:'accept'|'start'|'submit'|'approve'|'revision'){
    setWorkflowBusy(true);
    try{
      if(action==='accept')await taskAccept(taskId);
      if(action==='start')await taskStart(taskId);
      if(action==='submit')await taskSubmit(taskId);
      if(action==='approve')await reviewTask(taskId,'APPROVE');
      if(action==='revision'){const note=window.prompt('What needs revision?')||undefined;await reviewTask(taskId,'REVISION',note);}
      await load();
    }finally{setWorkflowBusy(false)}
  }

  return <AppShell area={staff ? "staff" : "admin"} title={task.title} breadcrumb="Work / Tasks" actions={<div className="task-detail-actions"><Link href="/tasks"><Button variant="outline">← Tasks</Button></Link>{!staff && !generated ? <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}{!staff && !generated ? <Button variant="danger" onClick={async () => { if (!window.confirm(`Delete task \"${task.title}\"?`)) return; await deleteTask(task.id); router.push("/tasks"); }}>Delete</Button> : null}</div>}>
    <div className="task-detail-page">
      <Card className="task-hero-card">
        <div className="task-hero-copy">
          <span className="eyebrow">{generated ? "Assignment-generated task" : "Task workspace"}</span>
          <h1>{task.title}</h1>
          <p>{task.description || "No instructions have been provided for this task."}</p>
        </div>
        <div className="task-hero-badges"><Badge tone={statusTone(task.status)}>{pretty(task.status)}</Badge><Badge tone={priorityTone(task.priority)}>{pretty(task.priority)} priority</Badge></div>
        <dl className="task-hero-meta">
          <div><dt>Assignee</dt><dd>{person(task.assignee_first_name, task.assignee_last_name)}</dd></div>
          <div><dt>Due</dt><dd>{formatDate(task.due_at)}</dd></div>
          <div><dt>Created by</dt><dd>{person(task.creator_first_name, task.creator_last_name)}</dd></div>
          <div><dt>Created</dt><dd>{formatDate(task.created_at)}</dd></div>
        </dl>
      </Card>

      <div className="task-detail-layout">
        <main className="task-detail-main">
          <Card className="workspace-card task-section-card">
            <header><div><span className="eyebrow">Work brief</span><h2>Instructions</h2></div></header>
            <div className="task-instructions"><p>{task.description || "No instructions provided."}</p></div>
            {staff ? <div className="task-completion-bar"><div><strong>Work sequence</strong><span>Accept → Start → Submit for review. Task completion never changes a Lead stage.</span></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{!task.accepted_at?<Button loading={workflowBusy} onClick={()=>void workflow('accept')}>Accept Task</Button>:null}{task.accepted_at && task.status==='TODO'?<Button loading={workflowBusy} onClick={()=>void workflow('start')}>Start Work</Button>:null}{(task.status==='IN_PROGRESS'||task.status==='BLOCKED')?<Button loading={workflowBusy} onClick={()=>void workflow('submit')}>Submit for Review</Button>:null}{task.status==='AWAITING_RESPONSE'?<Badge tone="warning">Awaiting Admin Review</Badge>:null}{task.status==='COMPLETED'?<Badge tone="success">Approved / Completed</Badge>:null}</div></div> : task.status==='AWAITING_RESPONSE'?<div className="task-completion-bar"><div><strong>Staff submitted this task</strong><span>Approve it as complete or request a revision.</span></div><div style={{display:'flex',gap:8}}><Button variant="outline" loading={workflowBusy} onClick={()=>void workflow('revision')}>Request Revision</Button><Button loading={workflowBusy} onClick={()=>void workflow('approve')}>Approve & Complete</Button></div></div> : task.status !== "COMPLETED" && task.status !== "CANCELLED" ? <div className="task-completion-bar"><div><strong>Admin task controls</strong><span>You can complete simple work directly, or let the assigned staff use Accept → Start → Submit.</span></div><Button loading={completing} onClick={() => void complete()}>Complete Task</Button></div> : <div className="task-complete-state"><strong>✓ Task completed</strong><span>This task is recorded as completed.</span></div>}
          </Card>

          {task.task_workflow ? <Card className="workspace-card task-section-card workflow-guide-card">
            <header><div><span className="eyebrow">Process guide</span><h2>{task.task_workflow.name}</h2><p>{task.task_workflow.description || "Follow the company workflow for this type of work."}</p></div><Badge tone="purple">{task.task_workflow.steps.filter((step)=>step.completed_at).length}/{task.task_workflow.steps.length}</Badge></header>
            <div className="task-workflow-checklist">{task.task_workflow.steps.map((step)=><button type="button" key={step.id} className={step.completed_at?"task-workflow-step is-complete":"task-workflow-step"} onClick={async()=>{setWorkflowBusy(true);try{await toggleTaskWorkflowStep(taskId,step.id,!step.completed_at,Boolean(staff));await load()}finally{setWorkflowBusy(false)}}} disabled={workflowBusy}><span className="workflow-check">{step.completed_at?"✓":step.position}</span><span><strong>{step.title}</strong>{step.guidance?<small>{step.guidance}</small>:null}{step.requires_evidence?<em>Evidence recommended</em>:null}</span></button>)}</div>
          </Card> : null}

          <Card className="workspace-card task-section-card">
            <header><div><span className="eyebrow">CRM context</span><h2>Related work</h2><p>Records connected to this task.</p></div></header>
            {generated && task.lead_assignment_batch ? <div className="task-assignment-context"><div className="task-related-primary"><div><span>Assignment</span><Link href={`/assignments/${task.lead_assignment_batch.id}`}>{task.lead_assignment_batch.title}</Link></div><Badge tone="purple">{assignmentItems.length} {assignmentItems.length === 1 ? "Lead" : "Leads"}</Badge></div><div className="task-related-leads">{assignmentItems.map((item) => <Link key={item.id} href={staff ? `/my-work/leads/${item.lead_id}` : `/leads/${item.lead_id}`} className="task-related-record"><div><strong>{item.organization_name}</strong><span>Lead · {pretty(item.stage)} · {item.pursuit_progress}% pursuit</span></div><span aria-hidden="true">→</span></Link>)}</div></div> : directRelated ? <div className="task-related-grid">{task.organization_name ? <div><span>Organization</span><strong>{task.organization_name}</strong></div> : null}{task.lead_id ? <div><span>Lead</span><Link href={staff ? `/my-work/leads/${task.lead_id}` : `/leads/${task.lead_id}`}>{task.lead_title || "Open Lead"}</Link></div> : null}{task.contact_id ? <div><span>Contact</span><strong>{person(task.contact_first_name, task.contact_last_name)}</strong></div> : null}</div> : <div className="task-empty-context"><strong>General task</strong><p>This task is not currently linked to a CRM record.</p></div>}
          </Card>

          {generated ? <Card className="workspace-card task-managed-card"><div className="task-managed-icon">↳</div><div><span className="eyebrow">Assignment managed</span><h2>Task structure is protected</h2><p>This task was generated by a Lead assignment. Edit and Delete are intentionally disabled here so the assignment, Lead ownership and operational history remain consistent.</p>{task.lead_assignment_batch ? <Link href={`/assignments/${task.lead_assignment_batch.id}`} className="assignment-link">Open assignment →</Link> : null}</div></Card> : null}
        </main>

        <aside className="task-detail-side">
          <Card className="workspace-card task-section-card task-timeline-card"><header><div><span className="eyebrow">History</span><h2>Task timeline</h2></div></header>{task.events.length ? <ol className="task-event-timeline">{task.events.map((event) => <li key={event.id}><span className="task-event-dot" aria-hidden="true"/><div><div className="task-event-head"><strong>{pretty(event.event_type)}</strong><time>{formatDate(event.created_at)}</time></div><p>{event.message || "Task activity recorded."}</p>{event.actor_first_name || event.actor_last_name ? <small>by {person(event.actor_first_name, event.actor_last_name)}</small> : null}</div></li>)}</ol> : <p className="muted">No task events yet.</p>}</Card>

          <Card className="workspace-card task-section-card task-files-card"><header><div><span className="eyebrow">Supporting files</span><h2>Attachments</h2><p>{task.attachments.length ? `${task.attachments.length} file${task.attachments.length === 1 ? "" : "s"} attached` : "Keep relevant work with the task."}</p></div></header>{task.attachments.length ? <div className="task-file-list">{task.attachments.map((file) => <article key={file.id}><div className="task-file-mark">▤</div><div><strong>{file.file_name}</strong><span>{[fileSize(file.file_size), formatDate(file.created_at)].filter(Boolean).join(" · ")}</span></div></article>)}</div> : <div className="task-file-empty"><strong>No attachments yet</strong><span>Add briefs, screenshots, reports or supporting documents.</span></div>}<label className="ui-button ui-button--outline ui-button--sm task-upload">{uploading ? "Uploading…" : "+ Add attachment"}<input type="file" hidden disabled={uploading} onChange={upload} /></label></Card>
        </aside>
      </div>
    </div>
    {!staff && !generated ? <EditTaskModal open={editing} task={task} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await load(); }} /> : null}
  </AppShell>;
}

function EditTaskModal({ open, task, onClose, onSaved }: { open: boolean; task: TaskDetail; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(task.title); const [description, setDescription] = useState(task.description ?? ""); const [priority, setPriority] = useState(task.priority); const [status, setStatus] = useState(task.status); const [dueAt, setDueAt] = useState(task.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : ""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  return <Modal open={open} onClose={onClose} title="Edit task"><form className="task-form" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(null); try { await updateTask(task.id, { title: title.trim(), description: description.trim() || null, priority, status, dueAt: dueAt ? new Date(dueAt).toISOString() : null }, false); await onSaved(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update task."); setSaving(false); } }}>
    <label className="ui-field"><span className="ui-label">Title *</span><input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} /></label><label className="ui-field"><span className="ui-label">Instructions</span><textarea className="ui-input" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
    <div className="task-form-grid"><label className="ui-field"><span className="ui-label">Priority</span><select className="ui-input" value={priority} onChange={(e) => setPriority(e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></label><label className="ui-field"><span className="ui-label">Status</span><select className="ui-input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="AWAITING_RESPONSE">Awaiting response</option><option value="BLOCKED">Blocked</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label></div>
    <label className="ui-field"><span className="ui-label">Due date</span><input className="ui-input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>{error ? <p className="task-form-error">{error}</p> : null}<div className="task-form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div>
  </form></Modal>;
}
