'use client';

import { FormEvent, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createPursuitWorkflow,
  updatePursuitWorkflow,
} from '@/lib/leads/api';
import type { PursuitWorkflowTemplate } from '@/lib/leads/types';

type EditorStep = {
  title: string;
  description: string;
  evidenceRequired: boolean;
};

type Props = {
  open: boolean;
  workflow: PursuitWorkflowTemplate | null;
  duplicateFrom?: PursuitWorkflowTemplate | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const emptyStep = (): EditorStep => ({
  title: '',
  description: '',
  evidenceRequired: false,
});

export function WorkflowEditorDialog({
  open,
  workflow,
  duplicateFrom = null,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<EditorStep[]>([emptyStep()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const source = workflow ?? duplicateFrom;
    queueMicrotask(() => { if (source) {
      setName(
        duplicateFrom && !workflow
          ? `${source.name} Copy`
          : source.name,
      );
      setDescription(source.description ?? '');
      setSteps(
        source.steps.map((step) => ({
          title: step.title,
          description: step.description ?? '',
          evidenceRequired: step.evidence_required,
        })),
      );
    } else {
      setName('');
      setDescription('');
      setSteps([emptyStep()]);
    }

    setError(null); });
  }, [open, workflow, duplicateFrom]);

  if (!open) return null;

  function patchStep(index: number, patch: Partial<EditorStep>) {
    setSteps((current) =>
      current.map((step, position) =>
        position === index ? { ...step, ...patch } : step,
      ),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;

    if (destination < 0 || destination >= steps.length) return;

    setSteps((current) => {
      const next = [...current];
      [next[index], next[destination]] = [
        next[destination],
        next[index],
      ];
      return next;
    });
  }

  function remove(index: number) {
    if (steps.length === 1) return;

    setSteps((current) =>
      current.filter((_, position) => position !== index),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleaned = steps
      .map((step) => ({
        title: step.title.trim(),
        description: step.description.trim() || null,
        evidenceRequired: step.evidenceRequired,
      }))
      .filter((step) => step.title);

    if (!name.trim()) {
      setError('Workflow name is required.');
      return;
    }

    if (!cleaned.length) {
      setError('Add at least one pursuit step.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (workflow) {
        await updatePursuitWorkflow(workflow.id, {
          name: name.trim(),
          description: description.trim() || null,
          steps: cleaned,
        });
      } else {
        await createPursuitWorkflow({
          name: name.trim(),
          description: description.trim() || null,
          steps: cleaned,
        });
      }

      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save the workflow.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="lead-dialog-layer workflow-dialog-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="lead-dialog workflow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-editor-title"
      >
        <header>
          <div>
            <h2 id="workflow-editor-title">
              {workflow
                ? 'Edit Pursuit Workflow'
                : duplicateFrom
                  ? 'Duplicate Pursuit Workflow'
                  : 'Create Pursuit Workflow'}
            </h2>
            <p>
              Define the operational steps staff follow while pursuing a
              Lead.
            </p>
          </div>

          <button
            type="button"
            className="row-action"
            aria-label="Close workflow editor"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </header>

        <form onSubmit={submit}>
          <div className="lead-form-body workflow-form-body">
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}

            <Input
              id="workflow-name"
              label="Workflow name"
              value={name}
              required
              placeholder="Standard Lead Pursuit"
              onChange={(event) => setName(event.target.value)}
            />

            <Textarea
              id="workflow-description"
              label="Description"
              rows={3}
              value={description}
              placeholder="The standard process staff follow when pursuing an organization Lead."
              onChange={(event) => setDescription(event.target.value)}
            />

            <div className="workflow-step-heading">
              <div>
                <h3>Pursuit steps</h3>
                <p>
                  Staff progress through these steps for each assigned Lead.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSteps((current) => [...current, emptyStep()])
                }
              >
                + Add step
              </Button>
            </div>

            <div className="workflow-step-editor-list">
              {steps.map((step, index) => (
                <section
                  className="workflow-step-editor"
                  key={index}
                >
                  <div className="workflow-step-number">
                    {index + 1}
                  </div>

                  <div className="workflow-step-fields">
                    <Input
                      label="Step title"
                      value={step.title}
                      required
                      placeholder={
                        index === 0
                          ? 'Research organization'
                          : 'Pursuit step'
                      }
                      onChange={(event) =>
                        patchStep(index, {
                          title: event.target.value,
                        })
                      }
                    />

                    <Textarea
                      label="Description"
                      rows={2}
                      value={step.description}
                      placeholder="Explain what staff should complete during this step."
                      onChange={(event) =>
                        patchStep(index, {
                          description: event.target.value,
                        })
                      }
                    />

                    <label className="workflow-evidence-toggle">
                      <input
                        type="checkbox"
                        checked={step.evidenceRequired}
                        onChange={(event) =>
                          patchStep(index, {
                            evidenceRequired: event.target.checked,
                          })
                        }
                      />
                      <span>
                        Evidence is required before this step can be
                        completed
                      </span>
                    </label>
                  </div>

                  <div className="workflow-step-actions">
                    <button
                      type="button"
                      aria-label={`Move step ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      aria-label={`Move step ${index + 1} down`}
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>

                    <button
                      type="button"
                      aria-label={`Remove step ${index + 1}`}
                      disabled={steps.length === 1}
                      onClick={() => remove(index)}
                    >
                      ×
                    </button>
                  </div>
                </section>
              ))}
            </div>
          </div>

          <footer>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>

            <Button type="submit" loading={saving}>
              {saving
                ? 'Saving…'
                : workflow
                  ? 'Save changes'
                  : 'Create workflow'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
