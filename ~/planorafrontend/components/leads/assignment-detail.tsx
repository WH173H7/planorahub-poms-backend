'use client';

import Link from 'next/link';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';

import { AppShell } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { StatusPill } from '@/components/ui/status-pill';

import {
  getAssignmentDetail,
  deleteAssignmentAttachment,
  getAssignmentAttachmentDownload,
  listAssignmentAttachments,
  uploadAssignmentAttachment,
  type AssignmentAttachment,
  type AssignmentDetail as AssignmentDetailType,
} from '@/lib/leads/assignments';

type Props = {
  assignmentId: string;
};

function formatDate(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function personName(
  first?: string | null,
  last?: string | null,
) {
  return [first, last].filter(Boolean).join(' ') || '—';
}

function priorityLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function stageLabel(stage: string) {
  return stage
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function AssignmentDetail({
  assignmentId,
}: Props) {
  const [assignment, setAssignment] =
    useState<AssignmentDetailType | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachments,setAttachments]=useState<AssignmentAttachment[]>([]);
  const [fileBusy,setFileBusy]=useState(false);
  const [fileMessage,setFileMessage]=useState<{tone:'success'|'error';text:string}|null>(null);
  const [loadedAt,setLoadedAt]=useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const detail=await getAssignmentDetail(assignmentId);
      setAssignment(detail);
      setAttachments(detail.task_id?await listAssignmentAttachments(assignmentId):[]);
      setLoadedAt(Date.now());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load this assignment.',
      );
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  async function uploadFiles(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files??[]);event.target.value='';
    if(!files.length)return;
    const invalid=files.find(file=>file.size>10*1024*1024);
    if(invalid){setFileMessage({tone:'error',text:`${invalid.name} is larger than 10 MB.`});return;}
    setFileBusy(true);setFileMessage(null);
    const failures:string[]=[];
    for(const file of files){try{await uploadAssignmentAttachment(assignmentId,file);}catch{failures.push(file.name);}}
    try{setAttachments(await listAssignmentAttachments(assignmentId));}catch{}
    setFileMessage(failures.length?{tone:'error',text:`Assignment remains valid, but these files failed to upload: ${failures.join(', ')}`}:{tone:'success',text:`${files.length} ${files.length===1?'file':'files'} uploaded.`});
    setFileBusy(false);
  }

  async function downloadFile(attachment:AssignmentAttachment){
    setFileMessage(null);
    try{const {signedUrl}=await getAssignmentAttachmentDownload(assignmentId,attachment.id);window.open(signedUrl,'_blank','noopener,noreferrer');}
    catch(caught){setFileMessage({tone:'error',text:caught instanceof Error?caught.message:'Unable to open this file.'});}
  }

  async function removeFile(attachment:AssignmentAttachment){
    if(!window.confirm(`Delete ${attachment.file_name}?`))return;
    setFileBusy(true);setFileMessage(null);
    try{await deleteAssignmentAttachment(assignmentId,attachment.id);setAttachments(await listAssignmentAttachments(assignmentId));setFileMessage({tone:'success',text:'Supporting file deleted.'});}
    catch(caught){setFileMessage({tone:'error',text:caught instanceof Error?caught.message:'Unable to delete this file.'});}
    finally{setFileBusy(false);}
  }

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const deadlineStatus = useMemo(() => {
    if (!assignment) return null;

    const due = new Date(assignment.due_at);

    if (Number.isNaN(due.getTime())) return null;

    if (assignment.task_status === 'COMPLETED') {
      return 'Completed';
    }

    if (due.getTime() < loadedAt) {
      return 'Overdue';
    }

    return 'Active';
  }, [assignment,loadedAt]);

  if (loading) {
    return (
      <AppShell
        area="admin"
        title="Assignment"
        breadcrumb="Leads"
        description="Loading assignment…"
      >
        <div className="assignment-detail-loading">
          Loading assignment…
        </div>
      </AppShell>
    );
  }

  if (error || !assignment) {
    return (
      <AppShell
        area="admin"
        title="Assignment"
        breadcrumb="Leads"
        description="Assignment details"
      >
        <div className="ui-card assignment-detail-error">
          <h2>Unable to open assignment</h2>
          <p>{error || 'Assignment not found.'}</p>

          <Button
            variant="outline"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      area="admin"
      title={assignment.title}
      breadcrumb="Leads / Assignment"
      description={`Created ${formatDate(assignment.created_at)}`}
      actions={
        <Link href="/leads">
          <Button variant="outline">← Lead Pool</Button>
        </Link>
      }
    >
      <div className="assignment-detail-page">
        <section className="assignment-summary-grid">
          <article className="ui-card assignment-summary-card">
            <span>Assigned Leads</span>
            <strong>{assignment.lead_count}</strong>
            <small>
              {assignment.active_lead_count} actively progressing
            </small>
          </article>

          <article className="ui-card assignment-summary-card">
            <span>Overall Progress</span>
            <strong>{assignment.average_progress}%</strong>
            <Progress value={assignment.average_progress} />
          </article>

          <article className="ui-card assignment-summary-card">
            <span>Completed Pursuits</span>
            <strong>
              {assignment.completed_pursuit_count}
            </strong>
            <small>
              of {assignment.lead_count} Leads
            </small>
          </article>

          <article className="ui-card assignment-summary-card">
            <span>Status</span>
            <strong className="assignment-status-text">
              {deadlineStatus}
            </strong>
            <small>Due {formatDate(assignment.due_at)}</small>
          </article>
        </section>

        <div className="assignment-main-grid">
          <section className="ui-card assignment-info-card">
            <div className="assignment-section-heading">
              <div>
                <h2>Assignment Details</h2>
                <p>
                  Ownership, workflow and deadline information.
                </p>
              </div>
            </div>

            <dl className="assignment-details-list">
              <div>
                <dt>Assigned to</dt>
                <dd>
                  {personName(
                    assignment.assignee_first_name,
                    assignment.assignee_last_name,
                  )}
                </dd>
              </div>

              <div>
                <dt>Created by</dt>
                <dd>
                  {personName(
                    assignment.creator_first_name,
                    assignment.creator_last_name,
                  )}
                </dd>
              </div>

              <div>
                <dt>Deadline</dt>
                <dd>{formatDate(assignment.due_at)}</dd>
              </div>

              <div>
                <dt>Pursuit workflow</dt>
                <dd>
                  {assignment.workflow_name ||
                    'Workflow snapshot'}
                </dd>
              </div>

              <div>
                <dt>Task status</dt>
                <dd>
                  {assignment.task_status
                    ? stageLabel(assignment.task_status)
                    : '—'}
                </dd>
              </div>

              <div>
                <dt>Created</dt>
                <dd>{formatDate(assignment.created_at)}</dd>
              </div>
            </dl>

            <div className="assignment-instructions">
              <h3>Instructions</h3>

              <p>{assignment.instructions}</p>
            </div>
          </section>

          <section className="ui-card assignment-files-card">
            <div className="assignment-section-heading">
              <div>
                <h2>Supporting Files</h2>
                <p>
                  Documents and resources provided for this assignment.
                </p>
              </div>
            </div>

            {assignment.task_id ? <>
              <label className="ui-button ui-button--outline ui-button--sm assignment-upload">+ Upload file<input type="file" multiple disabled={fileBusy} onChange={uploadFiles}/></label>
              {fileMessage?<Alert tone={fileMessage.tone}>{fileMessage.text}</Alert>:null}
              {attachments.length?<div className="assignment-file-list">{attachments.map(file=><article key={file.id}><div><strong>{file.file_name}</strong><span>{file.mime_type||'File'} · {formatFileSize(file.file_size)} · {personName(file.uploader_first_name,file.uploader_last_name)} · {formatDate(file.created_at)}</span></div><div><Button size="sm" variant="ghost" onClick={()=>void downloadFile(file)} disabled={fileBusy}>Open</Button><Button size="sm" variant="ghost" onClick={()=>void removeFile(file)} disabled={fileBusy}>Delete</Button></div></article>)}</div>:<div className="assignment-file-placeholder"><strong>No supporting files yet</strong><p>Upload private resources for the staff member assigned to this work.</p></div>}
            </> : (
              <p className="muted-text">
                No assignment Task is linked.
              </p>
            )}
          </section>
        </div>

        <section className="ui-card assignment-leads-card">
          <div className="assignment-section-heading">
            <div>
              <h2>Assigned Leads</h2>
              <p>
                Live pursuit progress for every organization in this
                assignment.
              </p>
            </div>

            <strong>{assignment.leads.length} Leads</strong>
          </div>

          <div className="assignment-lead-table-wrap">
            <table className="assignment-lead-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Priority</th>
                  <th>Stage</th>
                  <th>Progress</th>
                  <th>Next follow-up</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {assignment.leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className="assignment-org-cell">
                        <strong>
                          {lead.organization_name}
                        </strong>

                        {lead.organization_industry ? (
                          <span>
                            {lead.organization_industry}
                          </span>
                        ) : null}
                        {lead.assigned_to_id !== assignment.assigned_to_id ? (
                          <span>
                            Originally assigned to {personName(assignment.assignee_first_name, assignment.assignee_last_name)} · Current owner {personName(lead.current_owner_first_name, lead.current_owner_last_name)}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td>
                      <StatusPill
                        tone={
                          lead.priority === 'URGENT'
                            ? 'danger'
                            : lead.priority === 'HIGH'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {priorityLabel(lead.priority)}
                      </StatusPill>
                    </td>

                    <td>{stageLabel(lead.stage)}</td>

                    <td>
                      <div className="assignment-progress-cell">
                        <Progress
                          value={lead.pursuit_progress || 0}
                        />

                        <span>
                          {lead.pursuit_progress || 0}%
                        </span>
                      </div>
                    </td>

                    <td>
                      {formatDate(lead.next_follow_up_at)}
                    </td>

                    <td>
                      <Link href={`/leads/${lead.id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                        >
                          Open →
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function formatFileSize(value?:number|null){if(!value)return 'Unknown size';if(value<1024)return `${value} B`;if(value<1024*1024)return `${Math.ceil(value/1024)} KB`;return `${(value/(1024*1024)).toFixed(1)} MB`;}
