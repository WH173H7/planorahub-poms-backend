'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  createContact,
  createContactMethod,
  deleteContactMethod,
  updateContact,
  updateContactMethod,
} from '@/lib/leads/api';
import {
  CONTACT_METHOD_TYPES,
  type Contact,
  type ContactMethod,
  type ContactMethodType,
} from '@/lib/leads/types';

type ContactDialogProps = {
  open: boolean;
  organizationId: string;
  contact?: Contact | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type MethodDraft = {
  key: string;
  id?: string;
  type: ContactMethodType;
  value: string;
  label: string;
  notes: string;
  legacySource?: ContactMethod['legacy_source'];
};

function newMethod(type: ContactMethodType = 'EMAIL'): MethodDraft {
  return {
    key: crypto.randomUUID(),
    type,
    value: '',
    label: '',
    notes: '',
  };
}

function toDraft(method: ContactMethod): MethodDraft {
  return {
    key: method.id,
    id: method.id,
    type: method.type,
    value: method.value,
    label: method.legacy_source ? '' : (method.label ?? ''),
    notes: method.notes ?? '',
    legacySource: method.legacy_source,
  };
}

export function ContactDialog({
  open,
  organizationId,
  contact = null,
  onClose,
  onSaved,
}: ContactDialogProps) {
  const editing = Boolean(contact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [methods, setMethods] = useState<MethodDraft[]>(() => contact?.methods.map(toDraft) ?? [newMethod('EMAIL'), newMethod('PHONE')]);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    queueMicrotask(() => panel.current?.querySelector<HTMLInputElement>('input')?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, saving]);

  const existingManualIds = useMemo(
    () => new Set(contact?.methods.filter((method) => !method.legacy_source).map((method) => method.id) ?? []),
    [contact],
  );

  function changeMethod(key: string, patch: Partial<MethodDraft>) {
    setMethods((current) => current.map((method) => method.key === key ? { ...method, ...patch } : method));
  }

  function removeMethod(key: string) {
    setMethods((current) => current.filter((method) => method.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const activeMethods = methods
      .map((method) => ({ ...method, value: method.value.trim(), label: method.label.trim(), notes: method.notes.trim() }))
      .filter((method) => method.value);

    const legacyEmail = activeMethods.find((method) => method.legacySource === 'CONTACT_EMAIL');
    const legacyPhone = activeMethods.find((method) => method.legacySource === 'CONTACT_PHONE');

    // On a new contact, the first email/phone becomes the compatibility field.
    const primaryEmail = editing ? legacyEmail : activeMethods.find((method) => method.type === 'EMAIL');
    const primaryPhone = editing ? legacyPhone : activeMethods.find((method) => method.type === 'PHONE');

    const contactInput = {
      organizationId,
      firstName: String(data.get('firstName') ?? '').trim(),
      lastName: String(data.get('lastName') ?? '').trim(),
      jobTitle: String(data.get('jobTitle') ?? '').trim() || null,
      email: primaryEmail?.value || null,
      phone: primaryPhone?.value || null,
      isPrimary: data.get('isPrimary') === 'on',
      notes: String(data.get('notes') ?? '').trim() || null,
    };

    try {
      if (!contact) {
        const created = await createContact(contactInput);
        let consumedEmail = false;
        let consumedPhone = false;

        for (const method of activeMethods) {
          if (method.type === 'EMAIL' && !consumedEmail) {
            consumedEmail = true;
            continue;
          }
          if (method.type === 'PHONE' && !consumedPhone) {
            consumedPhone = true;
            continue;
          }
          await createContactMethod(created.id, {
            type: method.type,
            value: method.value,
            label: method.label || null,
            notes: method.notes || null,
          });
        }
      } else {
        await updateContact(contact.id, contactInput);

        const retainedManualIds = new Set(
          activeMethods
            .filter((method) => method.id && !method.legacySource)
            .map((method) => method.id as string),
        );

        for (const id of existingManualIds) {
          if (!retainedManualIds.has(id)) {
            await deleteContactMethod(contact.id, id);
          }
        }

        for (const method of activeMethods) {
          if (method.legacySource) continue;

          const payload = {
            type: method.type,
            value: method.value,
            label: method.label || null,
            notes: method.notes || null,
          };

          if (method.id) {
            await updateContactMethod(contact.id, method.id, payload);
          } else {
            await createContactMethod(contact.id, payload);
          }
        }
      }

      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to ${editing ? 'update' : 'add'} contact.`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="lead-dialog-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section ref={panel} className="lead-dialog contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-dialog-title">
        <header>
          <div>
            <h2 id="contact-dialog-title">{editing ? 'Edit Contact' : 'Add Contact'}</h2>
            <p>{editing ? 'Update the person and every way your team can reach them.' : 'Add the person and all known contact methods in one place.'}</p>
          </div>
          <button className="row-action" type="button" aria-label="Close contact form" onClick={onClose} disabled={saving}>×</button>
        </header>

        <form onSubmit={submit}>
          <div className="lead-form-body">
            {error ? <Alert tone="error">{error}</Alert> : null}

            <div>
              <span className="eyebrow">Person</span>
              <div className="lead-form-grid contact-person-grid">
                <Input id="contact-first-name" label="First name" name="firstName" required defaultValue={contact?.first_name ?? ''} />
                <Input id="contact-last-name" label="Last name" name="lastName" required defaultValue={contact?.last_name ?? ''} />
                <Input id="contact-job-title" label="Job title" name="jobTitle" defaultValue={contact?.job_title ?? ''} />
              </div>
            </div>

            <div className="contact-method-editor">
              <div className="contact-section-heading">
                <div>
                  <span className="eyebrow">Contact methods</span>
                  <h3>How can this person be reached?</h3>
                  <p>Add email, phone, LinkedIn, X, Instagram or any other useful channel.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setMethods((current) => [...current, newMethod()])}>
                  + Add method
                </Button>
              </div>

              {methods.length === 0 ? (
                <div className="contact-method-empty">
                  No contact method added yet. You can still save the person and add one later by editing the contact.
                </div>
              ) : (
                <div className="contact-method-editor-list">
                  {methods.map((method, index) => (
                    <div className="contact-method-editor-row" key={method.key}>
                      <div className="contact-method-row-head">
                        <strong>Method {index + 1}</strong>
                        {method.legacySource ? <span className="muted">Primary {method.type.toLowerCase()}</span> : null}
                        <button type="button" className="row-action contact-method-remove" onClick={() => removeMethod(method.key)} disabled={saving}>
                          Remove
                        </button>
                      </div>
                      <div className="contact-method-fields">
                        <NativeSelect
                          id={`contact-method-type-${method.key}`}
                          label="Type"
                          value={method.type}
                          disabled={Boolean(method.legacySource)}
                          onChange={(event) => changeMethod(method.key, { type: event.target.value as ContactMethodType })}
                        >
                          {CONTACT_METHOD_TYPES.map((type) => <option key={type} value={type}>{methodTypeLabel(type)}</option>)}
                        </NativeSelect>
                        <Input
                          id={`contact-method-value-${method.key}`}
                          label="Value"
                          value={method.value}
                          onChange={(event) => changeMethod(method.key, { value: event.target.value })}
                          placeholder={methodPlaceholder(method.type)}
                        />
                        {!method.legacySource ? (
                          <Input
                            id={`contact-method-label-${method.key}`}
                            label="Label (optional)"
                            value={method.label}
                            onChange={(event) => changeMethod(method.key, { label: event.target.value })}
                            placeholder="Work, direct, professional profile…"
                          />
                        ) : <div />}
                      </div>
                      <Input
                        id={`contact-method-notes-${method.key}`}
                        label="Method notes (optional)"
                        value={method.notes}
                        onChange={(event) => changeMethod(method.key, { notes: event.target.value })}
                        placeholder="Useful context about this channel"
                      />
                    </div>
                  ))}
                </div>
              )}
              <Alert tone="info">New or changed contact methods remain Unverified until your team confirms they work.</Alert>
            </div>

            <label className="contact-primary">
              <input type="checkbox" name="isPrimary" defaultChecked={contact?.is_primary ?? false} />
              Mark as primary contact for this organization
            </label>

            <Textarea id="contact-notes" label="Contact notes" name="notes" defaultValue={contact?.notes ?? ''} rows={4} />
          </div>

          <footer>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>{saving ? 'Saving Contact' : editing ? 'Save Changes' : 'Add Contact'}</Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function methodTypeLabel(type: ContactMethodType) {
  return type === 'X' ? 'X / Twitter' : type[0] + type.slice(1).toLowerCase();
}

function methodPlaceholder(type: ContactMethodType) {
  if (type === 'EMAIL') return 'name@company.com';
  if (type === 'PHONE') return '+234…';
  if (type === 'X') return '@handle or profile URL';
  if (type === 'LINKEDIN') return 'LinkedIn profile URL';
  if (type === 'INSTAGRAM') return '@handle or profile URL';
  if (type === 'FACEBOOK') return 'Facebook profile URL';
  if (type === 'WEBSITE') return 'https://…';
  return 'Contact value';
}
