'use client';

import { useMemo, useState, type ChangeEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  addOwnedPursuitComment,
  downloadOwnedPursuitEvidence,
  getOwnedLeadPursuit,
  submitOwnedPursuitStep,
  updateOwnedPursuitStep,
  uploadOwnedPursuitEvidence,
} from '@/lib/leads/api';
import { formatDate } from '@/lib/leads/helpers';
import type { Contact, Pursuit, PursuitField, PursuitStep } from '@/lib/leads/types';

type Props = {
  leadId: string;
  step: PursuitStep;
  contacts: Contact[];
  current: boolean;
  onChanged: (value: Pursuit) => Promise<void>;
};

function displayValue(field: PursuitField, value: unknown, contacts: Contact[]) {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'contact') {
    const person = contacts.find((contact) => contact.id === String(value));
    return person ? `${person.first_name} ${person.last_name}${person.job_title ? ` · ${person.job_title}` : ''}` : String(value);
  }
  if (field.type === 'multiselect' && Array.isArray(value)) return value.join(', ');
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.type === 'currency') {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value));
  }
  return String(value);
}

export function PursuitStageForm({ leadId, step, contacts, current, onChanged }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(step.field_values ?? {});
  const [notes, setNotes] = useState(step.notes ?? '');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blockingTasks = useMemo(() => step.tasks.filter((task) => task.blocks_completion), [step.tasks]);
  const incompleteBlockingTasks = blockingTasks.filter((task) => task.status !== 'COMPLETED');

  function setField(key: string, value: unknown) {
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateOwnedPursuitStep(leadId, step.id, {
        completed: false,
        fieldValues: values,
        notes: notes.trim() || null,
      });
      await onChanged(updated);
      setMessage('Draft saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the stage draft.');
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await submitOwnedPursuitStep(leadId, step.id, {
        fieldValues: values,
        notes: notes.trim() || null,
        comment: comment.trim() || null,
      });
      await onChanged(updated);
      setComment('');
      setMessage('Stage submitted. The next stage is now available when all transition requirements are satisfied.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit this stage.');
    } finally {
      setSaving(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      await uploadOwnedPursuitEvidence(leadId, step.id, file);
      const updated = await getOwnedLeadPursuit(leadId);
      if (updated) await onChanged(updated);
      setMessage('Evidence uploaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Evidence upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function openEvidence(evidenceId: string) {
    try {
      const result = await downloadOwnedPursuitEvidence(leadId, step.id, evidenceId);
      window.open(result.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open evidence.');
    }
  }

  async function addComment() {
    if (!comment.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addOwnedPursuitComment(leadId, step.id, comment.trim());
      const updated = await getOwnedLeadPursuit(leadId);
      if (updated) await onChanged(updated);
      setComment('');
      setMessage('Comment added.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add comment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={`workspace-card pursuit-stage-execution ${current ? 'is-current' : ''}`}>
      <header>
        <div>
          <div className="pursuit-step-kicker">
            <span className="eyebrow">Stage {step.position}</span>
            {current ? <Badge tone="warning">Current stage</Badge> : null}
            {step.completed ? <Badge tone="success">Submitted</Badge> : null}
            {step.review_status === 'RETAKE_REQUIRED' ? <Badge tone="danger">Retake required</Badge> : null}
          </div>
          <h2>{step.title}</h2>
          <p>{step.description || 'Complete the structured work required for this stage.'}</p>
        </div>
      </header>

      {step.guidance ? (
        <div className="pursuit-guidance">
          <span className="eyebrow">What this stage requires</span>
          <p>{step.guidance}</p>
        </div>
      ) : null}

      {!current ? (
        <section className="pursuit-readonly-values">
          <span className="eyebrow">Recorded stage response</span>
          {step.form_fields.length ? (
            <div className="detail-grid">
              {step.form_fields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{displayValue(field, step.field_values?.[field.key], contacts)}</dd>
                </div>
              ))}
            </div>
          ) : <p className="muted">No structured fields were configured for this stage.</p>}
          {step.notes ? <p className="pursuit-recorded-notes">{step.notes}</p> : null}
        </section>
      ) : (
        <div className="pursuit-stage-form-grid">
          {step.form_fields.map((field) => (
            <FieldInput key={field.key} field={field} value={values[field.key]} contacts={contacts} onChange={(value) => setField(field.key, value)} />
          ))}
        </div>
      )}

      {current ? (
        <Textarea
          label="Additional stage notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          placeholder="Add context that should remain with this stage submission."
        />
      ) : null}

      <section className="evidence-block">
        <div className="pursuit-section-heading">
          <div>
            <strong>Evidence</strong>
            <p>{step.evidence_min_count > 0 ? `At least ${step.evidence_min_count} file${step.evidence_min_count === 1 ? '' : 's'} required for submission.` : 'Evidence can be attached when useful.'}</p>
          </div>
          {current ? (
            <label className="ui-button ui-button--outline ui-button--sm evidence-upload">
              {uploading ? 'Uploading…' : 'Upload evidence'}
              <input type="file" onChange={upload} disabled={uploading || saving} />
            </label>
          ) : null}
        </div>
        {step.evidence.length ? (
          <ul>
            {step.evidence.map((file) => (
              <li key={file.id} className="pursuit-file-row">
                <button type="button" className="pursuit-file-link" onClick={() => void openEvidence(file.id)}>{file.file_name}</button>
                <small>{Math.ceil(file.file_size / 1024)} KB · {formatDate(file.created_at)}</small>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No evidence uploaded.</p>}
      </section>

      {step.tasks.length ? (
        <section className="pursuit-task-gate">
          <div className="pursuit-section-heading">
            <div>
              <strong>Stage tasks</strong>
              <p>Tasks created by Admin for this stage.</p>
            </div>
            {step.require_tasks_complete ? <Badge tone={incompleteBlockingTasks.length ? 'warning' : 'success'}>{incompleteBlockingTasks.length ? `${incompleteBlockingTasks.length} blocking` : 'All blocking tasks complete'}</Badge> : null}
          </div>
          <ul>
            {step.tasks.map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <small>{task.status.replaceAll('_', ' ')} · {task.assignee_first_name ? `${task.assignee_first_name} ${task.assignee_last_name ?? ''}` : 'Unassigned'}{task.due_at ? ` · due ${formatDate(task.due_at)}` : ''}</small>
                </div>
                {task.blocks_completion ? <Badge tone={task.status === 'COMPLETED' ? 'success' : 'warning'}>{task.status === 'COMPLETED' ? 'Complete' : 'Blocks stage'}</Badge> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : step.task_required ? (
        <Alert tone="warning">Admin must create a task for this stage before you can submit it.</Alert>
      ) : null}

      {step.comments_enabled ? (
        <section className="pursuit-comments">
          <div className="pursuit-section-heading">
            <div>
              <strong>Stage comments</strong>
              <p>Keep guidance and context with the stage instead of in personal notes.</p>
            </div>
          </div>
          {step.comments.length ? (
            <ol>
              {step.comments.map((item) => (
                <li key={item.id}>
                  <strong>{[item.author_first_name, item.author_last_name].filter(Boolean).join(' ') || 'Team member'}</strong>
                  <p>{item.body}</p>
                  <small>{formatDate(item.created_at)}</small>
                </li>
              ))}
            </ol>
          ) : <p className="muted">No comments yet.</p>}
          {current ? (
            <Textarea
              label="Comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              placeholder="Add a stage update, context or handoff note."
            />
          ) : null}
        </section>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      {current ? (
        <footer className="pursuit-stage-actions">
          <Button variant="outline" onClick={() => void saveDraft()} loading={saving}>Save draft</Button>
          {comment.trim() ? <Button variant="ghost" onClick={() => void addComment()} loading={saving}>Add comment</Button> : null}
          <Button onClick={() => void submit()} loading={saving}>Submit stage</Button>
        </footer>
      ) : null}
    </Card>
  );
}

function FieldInput({ field, value, contacts, onChange }: { field: PursuitField; value: unknown; contacts: Contact[]; onChange: (value: unknown) => void }) {
  const common = { name: field.key, id: `pursuit-${field.key}` };

  if (field.type === 'textarea') {
    return <label className="pursuit-field"><span>{field.label}{field.required ? ' *' : ''}</span><textarea {...common} rows={4} value={String(value ?? '')} placeholder={field.placeholder ?? ''} onChange={(event) => onChange(event.target.value)} />{field.helpText ? <small>{field.helpText}</small> : null}</label>;
  }

  if (field.type === 'select' || field.type === 'contact') {
    const options = field.type === 'contact' ? contacts.map((contact) => ({ value: contact.id, label: `${contact.first_name} ${contact.last_name}${contact.job_title ? ` · ${contact.job_title}` : ''}` })) : (field.options ?? []).map((option) => ({ value: option, label: option }));
    return <label className="pursuit-field"><span>{field.label}{field.required ? ' *' : ''}</span><select {...common} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{field.helpText ? <small>{field.helpText}</small> : null}</label>;
  }

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return <fieldset className="pursuit-field pursuit-multiselect"><legend>{field.label}{field.required ? ' *' : ''}</legend>{field.options?.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /> <span>{option}</span></label>)}{field.helpText ? <small>{field.helpText}</small> : null}</fieldset>;
  }

  if (field.type === 'checkbox') {
    return <label className="pursuit-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /> <span>{field.label}{field.required ? ' *' : ''}</span></label>;
  }

  const type = field.type === 'currency' || field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : field.type;
  return <label className="pursuit-field"><span>{field.label}{field.required ? ' *' : ''}</span><input {...common} type={type} value={value === undefined || value === null ? '' : String(value)} min={field.min ?? undefined} max={field.max ?? undefined} placeholder={field.placeholder ?? ''} onChange={(event) => onChange(type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} />{field.helpText ? <small>{field.helpText}</small> : null}</label>;
}
