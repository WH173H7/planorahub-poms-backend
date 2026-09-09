'use client';

import Link from 'next/link';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { uploadAssignmentAttachment } from '@/lib/leads/assignments';
import {
  bulkAssignLeads,
  listAssignmentStaff,
  listPursuitWorkflows,
} from '@/lib/leads/api';
import type {
  AssignmentStaff,
  Lead,
  PursuitWorkflowTemplate,
  BulkAssignmentResult,
} from '@/lib/leads/types';

type Props = {
  open: boolean;
  leads: Lead[];
  onClose: () => void;
  onAssigned: (result:BulkAssignmentResult) => Promise<void> | void;
};

export function AssignLeadsDialog({
  open,
  leads,
  onClose,
  onAssigned,
}: Props) {
  const [staff, setStaff] = useState<AssignmentStaff[]>([]);
  const [workflows, setWorkflows] = useState<PursuitWorkflowTemplate[]>([]);

  const [assignedToId, setAssignedToId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [instructions, setInstructions] = useState('');

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files,setFiles]=useState<File[]>([]);
  const [result,setResult]=useState<BulkAssignmentResult|null>(null);
  const [uploadWarning,setUploadWarning]=useState<string|null>(null);

  const visibleStaff = useMemo(
    () =>
      staff
        .filter((member) => member.role_code !== 'SUPER_ADMIN')
        .sort((a, b) => {
          if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
          if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1;

          return `${a.first_name} ${a.last_name}`.localeCompare(
            `${b.first_name} ${b.last_name}`,
          );
        }),
    [staff],
  );

  const assignmentPriority = useMemo(() => {
    const rank = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      URGENT: 4,
    } as const;

    return leads.reduce(
      (highest, lead) =>
        rank[lead.priority] > rank[highest] ? lead.priority : highest,
      'LOW' as Lead['priority'],
    );
  }, [leads]);

  useEffect(() => {
    if (!open) return;

    let active = true;

    Promise.resolve().then(() => { if(active){setError(null);setLoadingOptions(true);} return Promise.all([listAssignmentStaff(), listPursuitWorkflows()]); })
      .then(([staffRecords, workflowRecords]) => {
        if (!active) return;

        setStaff(staffRecords);
        setWorkflows(workflowRecords);

        const defaultWorkflow =
          workflowRecords.find((workflow) => workflow.is_default) ??
          workflowRecords[0];

        setWorkflowId(defaultWorkflow?.id ?? '');
      })
      .catch((caught: unknown) => {
        if (!active) return;

        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load assignment options.',
        );
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      queueMicrotask(()=>{setAssignedToId('');setWorkflowId('');setTitle('');setDueAt('');setInstructions('');setError(null);setFiles([]);setResult(null);setUploadWarning(null);});
    }
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!leads.length) {
      setError('Select at least one organization lead.');
      return;
    }

    if (!assignedToId) {
      setError('Select a staff member.');
      return;
    }

    if (!workflowId) {
      setError('Select a pursuit workflow.');
      return;
    }

    if (!title.trim()) {
      setError('Assignment title is required.');
      return;
    }

    if (!dueAt) {
      setError('Assignment deadline is required.');
      return;
    }

    if (!instructions.trim()) {
      setError('Assignment instructions are required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const assignment=await bulkAssignLeads({
        leadIds: leads.map((lead) => lead.id),
        assignedToId,
        workflowId,
        title: title.trim(),
        instructions: instructions.trim(),
        priority: assignmentPriority,
        dueAt: new Date(dueAt).toISOString(),
      });
      const failed:string[]=[];
      for(const file of files){try{await uploadAssignmentAttachment(assignment.batchId,file);}catch{failed.push(file.name);}}
      setResult(assignment);
      if(failed.length)setUploadWarning(`The assignment was created, but these files failed to upload: ${failed.join(', ')}. You can retry from Assignment Detail.`);
      await onAssigned(assignment);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The selected leads could not be assigned.',
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedWorkflow = workflows.find(
    (workflow) => workflow.id === workflowId,
  );

  function chooseFiles(event:ChangeEvent<HTMLInputElement>){
    const chosen=Array.from(event.target.files??[]);event.target.value='';
    if(chosen.length>5){setError('Choose up to 5 supporting files at a time.');return;}
    const oversized=chosen.find(file=>file.size>10*1024*1024);
    if(oversized){setError(`${oversized.name} is larger than 10 MB.`);return;}
    setError(null);setFiles(chosen);
  }

  return (
    <div
      className="lead-dialog-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="lead-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-leads-title"
      >
        <header>
          <div>
            <h2 id="assign-leads-title">Assign Leads</h2>
            <p>
              Create one pursuit assignment for {leads.length}{' '}
              {leads.length === 1 ? 'organization' : 'organizations'}.
            </p>
          </div>

          <button
            type="button"
            className="row-action"
            aria-label="Close assignment dialog"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </header>

        {result?<div className="lead-form-body assignment-success"><Alert tone="success"><div><strong>{result.title} was created successfully.</strong><div>{result.leadCount} {result.leadCount===1?'Lead':'Leads'} assigned.</div></div></Alert>{uploadWarning?<Alert tone="warning">{uploadWarning}</Alert>:null}<div className="assignment-success-actions"><Button variant="outline" onClick={onClose}>Close</Button><Link href={`/assignments/${result.batchId}`}><Button>View assignment</Button></Link></div></div>:<form onSubmit={submit}>
          <div className="lead-form-body">
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}

            <Input
              id="assignment-title"
              label="Assignment title"
              placeholder="Fintech outreach — September"
              value={title}
              required
              disabled={saving}
              onChange={(event) => setTitle(event.target.value)}
            />

            <NativeSelect
              id="assignment-staff"
              label="Assign to"
              value={assignedToId}
              required
              disabled={saving || loadingOptions}
              onChange={(event) => setAssignedToId(event.target.value)}
            >
              <option value="">
                {loadingOptions
                  ? 'Loading staff…'
                  : 'Select active staff member'}
              </option>

              {visibleStaff.map((member) => (
                <option
                  key={member.id}
                  value={member.id}
                  disabled={member.status !== 'ACTIVE'}
                >
                  {member.first_name} {member.last_name}
                  {member.job_title ? ` — ${member.job_title}` : ''}
                  {member.status !== 'ACTIVE'
                    ? ` — ${member.status.toLowerCase()}`
                    : ''}
                </option>
              ))}
            </NativeSelect>

            <div className="lead-form-grid">
              <Input
                id="assignment-deadline"
                label="Deadline"
                type="datetime-local"
                value={dueAt}
                required
                disabled={saving}
                onChange={(event) => setDueAt(event.target.value)}
              />

              <NativeSelect
                id="assignment-workflow"
                label="Pursuit workflow"
                value={workflowId}
                required
                disabled={saving || loadingOptions}
                onChange={(event) => setWorkflowId(event.target.value)}
              >
                <option value="">
                  {loadingOptions ? 'Loading workflows…' : 'Select workflow'}
                </option>

                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                    {workflow.is_default ? ' — Default' : ''}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {selectedWorkflow ? (
              <div className="assignment-workflow-preview">
                <strong>{selectedWorkflow.name}</strong>
                <span>
                  {selectedWorkflow.steps.length} pursuit{' '}
                  {selectedWorkflow.steps.length === 1 ? 'step' : 'steps'}
                </span>
                {selectedWorkflow.description ? (
                  <p>{selectedWorkflow.description}</p>
                ) : null}
              </div>
            ) : null}

            <Textarea
              id="assignment-instructions"
              label="Instructions"
              rows={5}
              placeholder="Research each organization, identify the appropriate decision maker, verify a usable contact method and begin outreach."
              value={instructions}
              required
              disabled={saving}
              onChange={(event) => setInstructions(event.target.value)}
            />

            <div className="assignment-supporting-files"><span className="ui-label">Supporting files (optional)</span><label className="ui-button ui-button--outline ui-button--sm">Choose files<input type="file" multiple onChange={chooseFiles} disabled={saving}/></label><small>Up to 5 files, 10 MB each. Uploaded privately after the assignment is created.</small>{files.length?<ul>{files.map(file=><li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}</ul>:null}</div>

            <div className="assignment-selection-summary">
              <strong>
                {leads.length} {leads.length === 1 ? 'Lead' : 'Leads'} selected
              </strong>

              <div>
                {leads.slice(0, 4).map((lead) => (
                  <span key={lead.id}>{lead.organization_name}</span>
                ))}

                {leads.length > 4 ? (
                  <span>+{leads.length - 4} more</span>
                ) : null}
              </div>
            </div>
          </div>

          <footer>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              loading={saving}
              disabled={loadingOptions}
            >
              {saving
                ? 'Assigning…'
                : `Assign ${leads.length} ${
                    leads.length === 1 ? 'Lead' : 'Leads'
                  }`}
            </Button>
          </footer>
        </form>}
      </div>
    </div>
  );
}
