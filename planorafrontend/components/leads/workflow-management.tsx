'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageErrorState } from '@/components/ui/page-state';
import {
  archivePursuitWorkflow,
  listPursuitWorkflows,
  setDefaultPursuitWorkflow,
} from '@/lib/leads/api';
import type { PursuitWorkflowTemplate } from '@/lib/leads/types';

import { WorkflowEditorDialog } from './workflow-editor-dialog';

export function WorkflowManagement() {
  const [workflows, setWorkflows] = useState<PursuitWorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PursuitWorkflowTemplate | null>(null);
  const [duplicating, setDuplicating] = useState<PursuitWorkflowTemplate | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkflows(await listPursuitWorkflows());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load pursuit workflows.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => workflows.filter((workflow) => workflow.is_active), [workflows]);
  const defaultWorkflow = workflows.find((workflow) => workflow.is_default) ?? null;
  const totalSteps = active.reduce((sum, workflow) => sum + workflow.steps.length, 0);

  async function makeDefault(workflow: PursuitWorkflowTemplate) {
    setWorkingId(workflow.id);
    try {
      await setDefaultPursuitWorkflow(workflow.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change the default workflow.');
    } finally {
      setWorkingId(null);
    }
  }

  async function archive(workflow: PursuitWorkflowTemplate) {
    if (workflow.is_default) return;
    if (!window.confirm(`Archive "${workflow.name}"? Existing Lead pursuits will not be changed.`)) return;
    setWorkingId(workflow.id);
    try {
      await archivePursuitWorkflow(workflow.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive the workflow.');
    } finally {
      setWorkingId(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setDuplicating(null);
    setEditorOpen(true);
  }

  return (
    <AppShell
      area="admin"
      title="Lead Workflows"
      breadcrumb="Sales / Leads"
      description="Design the pursuit journey staff follow after a Lead is assigned or self-selected from the Lead Pool."
      actions={<Button onClick={openCreate}>+ Create Workflow</Button>}
    >
      <div className="page-stack lead-workflow-page">
        <Card className="workflow-control-hero">
          <div>
            <span className="eyebrow">Pursuit operating system</span>
            <h2>Standardize how every Lead is worked.</h2>
            <p>Workflows guide research, contact discovery, outreach, follow-ups and evidence. They do not capture money while the record is still being worked as a Lead.</p>
          </div>
          <div className="workflow-hero-stats">
            <div><span>Active workflows</span><strong>{active.length}</strong></div>
            <div><span>Default workflow</span><strong>{defaultWorkflow?.name || 'Not set'}</strong></div>
            <div><span>Configured steps</span><strong>{totalSteps}</strong></div>
          </div>
        </Card>

        <Card className="workflow-final-gate">
          <div className="workflow-final-gate-number">Final gate</div>
          <div>
            <span className="eyebrow">Prospect handoff</span>
            <h2>Expected revenue is captured only when staff recommends a Lead as a Prospect.</h2>
            <p>At the final Lead stage, staff must enter Expected Revenue before submitting for Prospect Review. Admin and the involved staff receive in-app and email lifecycle notifications.</p>
          </div>
          <Badge tone="warning">Lead → Prospect Review</Badge>
        </Card>

        {error ? (
          <Card><div className="ui-card-content"><PageErrorState message={error} /><Button variant="outline" onClick={() => void load()}>Retry</Button></div></Card>
        ) : null}

        {!error && loading ? <Card><div className="workflow-loading">Loading workflows…</div></Card> : null}

        {!error && !loading && workflows.length === 0 ? (
          <Card>
            <EmptyState
              icon="workflow"
              title="No pursuit workflows yet"
              description="Create the process staff should follow after a Lead is assigned or picked from the Lead Pool."
              action={<Button onClick={openCreate}>Create workflow</Button>}
            />
          </Card>
        ) : null}

        {!error && !loading && workflows.length > 0 ? (
          <div className="workflow-grid workflow-grid-polished">
            {workflows.map((workflow) => (
              <article key={workflow.id} className={`workflow-card ui-card ${workflow.is_default ? 'is-default' : ''}`}>
                <header className="workflow-card-header">
                  <div>
                    <div className="workflow-title-line">
                      <h2>{workflow.name}</h2>
                      {workflow.is_default ? <Badge tone="purple">Default</Badge> : null}
                      {!workflow.is_active ? <Badge tone="neutral">Archived</Badge> : null}
                    </div>
                    <p>{workflow.description || 'Organization Lead pursuit workflow.'}</p>
                  </div>
                  <div className="workflow-step-count"><strong>{workflow.steps.length}</strong><span>{workflow.steps.length === 1 ? 'step' : 'steps'}</span></div>
                </header>

                <div className="workflow-route-line" aria-hidden="true">
                  <span>Assigned</span><i>→</i><span>Pursuit</span><i>→</i><span>Prospect Review</span>
                </div>

                <ol className="workflow-preview-list">
                  {workflow.steps.map((step) => (
                    <li key={step.id}>
                      <span>{step.position}</span>
                      <div><strong>{step.title}</strong>{step.description ? <p>{step.description}</p> : null}</div>
                      {step.evidence_required ? <small>Evidence required</small> : null}
                    </li>
                  ))}
                </ol>

                <footer className="workflow-card-actions">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(workflow); setDuplicating(null); setEditorOpen(true); }}>Edit workflow</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setDuplicating(workflow); setEditorOpen(true); }}>Duplicate</Button>
                  {!workflow.is_default ? <>
                    <Button size="sm" variant="ghost" disabled={workingId === workflow.id} onClick={() => void makeDefault(workflow)}>Make default</Button>
                    <Button size="sm" variant="ghost" disabled={workingId === workflow.id} onClick={() => void archive(workflow)}>Archive</Button>
                  </> : null}
                </footer>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <WorkflowEditorDialog
        open={editorOpen}
        workflow={editing}
        duplicateFrom={duplicating}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          setEditorOpen(false);
          setEditing(null);
          setDuplicating(null);
          await load();
        }}
      />
    </AppShell>
  );
}
