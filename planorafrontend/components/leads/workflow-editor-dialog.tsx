'use client';

import { FormEvent, useEffect, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createPursuitWorkflow, updatePursuitWorkflow } from '@/lib/leads/api';
import type { PursuitField, PursuitFieldType, PursuitWorkflowTemplate } from '@/lib/leads/types';

type EditorStep = {
  title: string;
  description: string;
  guidance: string;
  formFields: PursuitField[];
  commentsEnabled: boolean;
  evidenceMinCount: number;
  taskRequired: boolean;
  requireTasksComplete: boolean;
  followUpRequired: boolean;
};

type Props = {
  open: boolean;
  workflow: PursuitWorkflowTemplate | null;
  duplicateFrom?: PursuitWorkflowTemplate | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const fieldTypes: Array<{ value: PursuitFieldType; label: string }> = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & time' },
  { value: 'select', label: 'Single select' },
  { value: 'multiselect', label: 'Multi select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'contact', label: 'Organisation contact' },
];

const emptyField = (index = 0): PursuitField => ({
  key: `field_${Date.now()}_${index}`,
  label: '',
  type: 'text',
  required: false,
  placeholder: '',
  helpText: '',
  options: [],
});

const emptyStep = (): EditorStep => ({
  title: '',
  description: '',
  guidance: '',
  formFields: [],
  commentsEnabled: true,
  evidenceMinCount: 0,
  taskRequired: false,
  requireTasksComplete: false,
  followUpRequired: false,
});

export function WorkflowEditorDialog({ open, workflow, duplicateFrom = null, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<EditorStep[]>([emptyStep()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const source = workflow ?? duplicateFrom;
    queueMicrotask(() => {
      if (source) {
        setName(duplicateFrom && !workflow ? `${source.name} Copy` : source.name);
        setDescription(source.description ?? '');
        setSteps(source.steps.map((step) => ({
          title: step.title,
          description: step.description ?? '',
          guidance: step.guidance ?? '',
          formFields: (step.form_fields ?? []).map((field) => ({ ...field, options: [...(field.options ?? [])] })),
          commentsEnabled: step.comments_enabled !== false,
          evidenceMinCount: Number(step.evidence_min_count ?? (step.evidence_required ? 1 : 0)),
          taskRequired: Boolean(step.task_required),
          requireTasksComplete: Boolean(step.require_tasks_complete),
          followUpRequired: Boolean(step.follow_up_required),
        })));
      } else {
        setName('');
        setDescription('');
        setSteps([emptyStep()]);
      }
      setError(null);
    });
  }, [open, workflow, duplicateFrom]);

  if (!open) return null;

  function patchStep(index: number, patch: Partial<EditorStep>) {
    setSteps((current) => current.map((step, position) => position === index ? { ...step, ...patch } : step));
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  function removeStep(index: number) {
    if (steps.length === 1) return;
    setSteps((current) => current.filter((_, position) => position !== index));
  }

  function addField(stepIndex: number) {
    setSteps((current) => current.map((step, index) => index === stepIndex ? { ...step, formFields: [...step.formFields, emptyField(step.formFields.length)] } : step));
  }

  function patchField(stepIndex: number, fieldIndex: number, patch: Partial<PursuitField>) {
    setSteps((current) => current.map((step, index) => index === stepIndex ? {
      ...step,
      formFields: step.formFields.map((field, position) => position === fieldIndex ? { ...field, ...patch } : field),
    } : step));
  }

  function removeField(stepIndex: number, fieldIndex: number) {
    setSteps((current) => current.map((step, index) => index === stepIndex ? { ...step, formFields: step.formFields.filter((_, position) => position !== fieldIndex) } : step));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return setError('Workflow name is required.');
    if (!steps.length || steps.some((step) => !step.title.trim())) return setError('Every stage needs a title.');

    const cleaned = steps.map((step) => ({
      title: step.title.trim(),
      description: step.description.trim() || null,
      guidance: step.guidance.trim() || null,
      formFields: step.formFields.map((field) => ({
        ...field,
        key: field.key.trim() || field.label.trim(),
        label: field.label.trim(),
        placeholder: field.placeholder?.trim() || null,
        helpText: field.helpText?.trim() || null,
        options: field.options?.map((option) => option.trim()).filter(Boolean),
      })),
      commentsEnabled: step.commentsEnabled,
      evidenceMinCount: Math.max(0, Number(step.evidenceMinCount) || 0),
      taskRequired: step.taskRequired,
      requireTasksComplete: step.requireTasksComplete,
      followUpRequired: step.followUpRequired,
    }));

    setSaving(true);
    setError(null);
    try {
      if (workflow) await updatePursuitWorkflow(workflow.id, { name: name.trim(), description: description.trim() || null, steps: cleaned });
      else await createPursuitWorkflow({ name: name.trim(), description: description.trim() || null, steps: cleaned });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the workflow.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lead-dialog-layer workflow-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div className="lead-dialog workflow-dialog workflow-builder-v2" role="dialog" aria-modal="true" aria-labelledby="workflow-editor-title">
        <header>
          <div>
            <span className="eyebrow">Pursuit Workflow Builder</span>
            <h2 id="workflow-editor-title">{workflow ? 'Edit Pursuit Workflow' : duplicateFrom ? 'Duplicate Pursuit Workflow' : 'Create Pursuit Workflow'}</h2>
            <p>Configure the stage order, guidance, structured response fields, evidence, tasks and follow-up requirements that staff must satisfy.</p>
          </div>
          <button type="button" className="row-action" aria-label="Close workflow editor" onClick={onClose} disabled={saving}>×</button>
        </header>

        <form onSubmit={submit}>
          <div className="lead-form-body workflow-form-body">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Input id="workflow-name" label="Workflow name" value={name} required placeholder="Standard Commercial Pursuit" onChange={(event) => setName(event.target.value)} />
            <Textarea id="workflow-description" label="Description" rows={3} value={description} placeholder="When this workflow should be used and what outcome it is designed to produce." onChange={(event) => setDescription(event.target.value)} />

            <div className="workflow-builder-notice">
              <strong>How the workflow works</strong>
              <p>Staff can save drafts, but the backend controls stage progression. Required fields, evidence, blocking tasks and follow-ups must be satisfied before a stage can be submitted.</p>
            </div>

            <div className="workflow-step-heading">
              <div><h3>Stages</h3><p>Each stage is its own structured form. The Research stage is where the seven commercial/event fields belong.</p></div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSteps((current) => [...current, emptyStep()])}>+ Add stage</Button>
            </div>

            <div className="workflow-step-editor-list">
              {steps.map((step, index) => (
                <section className="workflow-step-editor workflow-stage-builder" key={`${step.title}-${index}`}>
                  <div className="workflow-step-number">{index + 1}</div>
                  <div className="workflow-step-fields">
                    <Input label="Stage name" value={step.title} required placeholder={index === 0 ? 'Research' : 'Stage name'} onChange={(event) => patchStep(index, { title: event.target.value })} />
                    <Textarea label="Stage description" rows={2} value={step.description} placeholder="What this stage represents." onChange={(event) => patchStep(index, { description: event.target.value })} />
                    <Textarea label="Staff guidance" rows={3} value={step.guidance} placeholder="Tell the staff member exactly what good completion looks like." onChange={(event) => patchStep(index, { guidance: event.target.value })} />

                    <div className="workflow-stage-controls">
                      <label><input type="checkbox" checked={step.commentsEnabled} onChange={(event) => patchStep(index, { commentsEnabled: event.target.checked })} /> Comments enabled</label>
                      <label><input type="checkbox" checked={step.taskRequired} onChange={(event) => patchStep(index, { taskRequired: event.target.checked })} /> Task required</label>
                      <label><input type="checkbox" checked={step.requireTasksComplete} onChange={(event) => patchStep(index, { requireTasksComplete: event.target.checked })} /> Blocking tasks must be complete</label>
                      <label><input type="checkbox" checked={step.followUpRequired} onChange={(event) => patchStep(index, { followUpRequired: event.target.checked })} /> Follow-up required</label>
                    </div>

                    <label className="pursuit-field workflow-evidence-count"><span>Minimum evidence files</span><input type="number" min={0} max={20} value={step.evidenceMinCount} onChange={(event) => patchStep(index, { evidenceMinCount: Number(event.target.value) || 0 })} /><small>Set 0 when evidence is optional. The staff UI still provides evidence upload for every stage.</small></label>

                    <div className="workflow-fields-builder">
                      <div className="workflow-fields-builder-heading"><div><h4>Stage form fields</h4><p>These fields are stored with the Pursuit stage and validated by the backend.</p></div><Button type="button" size="sm" variant="outline" onClick={() => addField(index)}>+ Add field</Button></div>
                      {step.formFields.length ? step.formFields.map((field, fieldIndex) => (
                        <div className="workflow-field-editor" key={`${field.key}-${fieldIndex}`}>
                          <Input label="Field label" value={field.label} onChange={(event) => patchField(index, fieldIndex, { label: event.target.value })} placeholder="Field label" />
                          <Input label="Field key" value={field.key} onChange={(event) => patchField(index, fieldIndex, { key: event.target.value })} placeholder="field_key" />
                          <label className="pursuit-field"><span>Type</span><select value={field.type} onChange={(event) => patchField(index, fieldIndex, { type: event.target.value as PursuitFieldType })}>{fieldTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                          <label className="workflow-field-required"><input type="checkbox" checked={field.required} onChange={(event) => patchField(index, fieldIndex, { required: event.target.checked })} /> Required</label>
                          <Input label="Placeholder" value={field.placeholder ?? ''} onChange={(event) => patchField(index, fieldIndex, { placeholder: event.target.value })} placeholder="Optional" />
                          <Input label="Help text" value={field.helpText ?? ''} onChange={(event) => patchField(index, fieldIndex, { helpText: event.target.value })} placeholder="Optional guidance" />
                          {(field.type === 'select' || field.type === 'multiselect') ? <Input label="Options (comma separated)" value={(field.options ?? []).join(', ')} onChange={(event) => patchField(index, fieldIndex, { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Option A, Option B, Option C" /> : null}
                          {(field.type === 'number' || field.type === 'currency') ? <div className="workflow-form-two-column"><Input label="Minimum" type="number" value={field.min ?? ''} onChange={(event) => patchField(index, fieldIndex, { min: event.target.value === '' ? null : Number(event.target.value) })} /><Input label="Maximum" type="number" value={field.max ?? ''} onChange={(event) => patchField(index, fieldIndex, { max: event.target.value === '' ? null : Number(event.target.value) })} /></div> : null}
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeField(index, fieldIndex)}>Remove field</Button>
                        </div>
                      )) : <p className="muted">No structured fields yet. Add fields to make this stage a real form.</p>}
                    </div>
                  </div>

                  <div className="workflow-step-actions">
                    <button type="button" aria-label={`Move stage ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                    <button type="button" aria-label={`Move stage ${index + 1} down`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}>↓</button>
                    <button type="button" aria-label={`Remove stage ${index + 1}`} disabled={steps.length === 1} onClick={() => removeStep(index)}>×</button>
                  </div>
                </section>
              ))}
            </div>
          </div>

          <footer>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>{saving ? 'Saving…' : workflow ? 'Save changes' : 'Create workflow'}</Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
