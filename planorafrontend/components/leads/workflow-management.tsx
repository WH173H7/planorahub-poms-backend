'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
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
  const [workflows, setWorkflows] = useState<
    PursuitWorkflowTemplate[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] =
    useState<PursuitWorkflowTemplate | null>(null);
  const [duplicating, setDuplicating] =
    useState<PursuitWorkflowTemplate | null>(null);

  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setWorkflows(await listPursuitWorkflows());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load pursuit workflows.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function makeDefault(workflow: PursuitWorkflowTemplate) {
    setWorkingId(workflow.id);

    try {
      await setDefaultPursuitWorkflow(workflow.id);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to change the default workflow.',
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function archive(workflow: PursuitWorkflowTemplate) {
    if (workflow.is_default) return;

    const confirmed = window.confirm(
      `Archive "${workflow.name}"? Existing Lead pursuits will not be changed.`,
    );

    if (!confirmed) return;

    setWorkingId(workflow.id);

    try {
      await archivePursuitWorkflow(workflow.id);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to archive the workflow.',
      );
    } finally {
      setWorkingId(null);
    }
  }

  function create() {
    setEditing(null);
    setDuplicating(null);
    setEditorOpen(true);
  }

  function edit(workflow: PursuitWorkflowTemplate) {
    setEditing(workflow);
    setDuplicating(null);
    setEditorOpen(true);
  }

  function duplicate(workflow: PursuitWorkflowTemplate) {
    setEditing(null);
    setDuplicating(workflow);
    setEditorOpen(true);
  }

  return (
    <AppShell
      area="admin"
      title="Lead Workflows"
      breadcrumb="Administration"
      description="Configure the pursuit processes staff follow for assigned organization Leads."
      actions={
        <Button onClick={create}>+ Create Workflow</Button>
      }
    >
      {error ? (
        <div className="page-section">
          <PageErrorState message={error} />
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {!error && loading ? (
        <div className="workflow-loading">Loading workflows…</div>
      ) : null}

      {!error && !loading && workflows.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            icon="workflow"
            title="No pursuit workflows yet"
            description="Create the process staff should follow after a Lead is assigned."
            action={
              <Button onClick={create}>Create workflow</Button>
            }
          />
        </div>
      ) : null}

      {!error && !loading && workflows.length > 0 ? (
        <div className="workflow-grid">
          {workflows.map((workflow) => (
            <article
              key={workflow.id}
              className="workflow-card ui-card"
            >
              <header className="workflow-card-header">
                <div>
                  <div className="workflow-title-line">
                    <h2>{workflow.name}</h2>

                    {workflow.is_default ? (
                      <span className="workflow-default-badge">
                        DEFAULT
                      </span>
                    ) : null}
                  </div>

                  <p>
                    {workflow.description ||
                      'Organization Lead pursuit workflow.'}
                  </p>
                </div>

                <strong className="workflow-step-count">
                  {workflow.steps.length}{' '}
                  {workflow.steps.length === 1 ? 'step' : 'steps'}
                </strong>
              </header>

              <ol className="workflow-preview-list">
                {workflow.steps.map((step) => (
                  <li key={step.id}>
                    <span>{step.position}</span>

                    <div>
                      <strong>{step.title}</strong>

                      {step.description ? (
                        <p>{step.description}</p>
                      ) : null}
                    </div>

                    {step.evidence_required ? (
                      <small>Evidence</small>
                    ) : null}
                  </li>
                ))}
              </ol>

              <footer className="workflow-card-actions">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => edit(workflow)}
                >
                  Edit
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => duplicate(workflow)}
                >
                  Duplicate
                </Button>

                {!workflow.is_default ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={workingId === workflow.id}
                      onClick={() => void makeDefault(workflow)}
                    >
                      Make default
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={workingId === workflow.id}
                      onClick={() => void archive(workflow)}
                    >
                      Archive
                    </Button>
                  </>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      ) : null}

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
