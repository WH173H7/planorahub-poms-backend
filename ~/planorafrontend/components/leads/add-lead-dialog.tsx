'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { createOrganizationLead } from '@/lib/leads/api';
import type { CreateOrganizationLeadInput, LeadPriority } from '@/lib/leads/types';
import { LEAD_PRIORITIES } from '@/lib/leads/types';
import { priorityLabel } from '@/lib/leads/helpers';

const initial: CreateOrganizationLeadInput = {
  organizationName: '',
  website: '',
  industry: '',
  location: '',
  email: '',
  phone: '',
  source: '',
  priority: 'MEDIUM',
  notes: '',
};

export function AddLeadDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState<CreateOrganizationLeadInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', key);
    queueMicrotask(() => panel.current?.querySelector<HTMLInputElement>('input')?.focus());
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', key); };
  }, [open, onClose, saving]);

  function set<K extends keyof CreateOrganizationLeadInput>(key: K, value: CreateOrganizationLeadInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = form.organizationName.trim();
    if (!name) { setError('Enter the organization name.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createOrganizationLead({
        ...form,
        organizationName: name,
        website: form.website?.trim() || null,
        industry: form.industry?.trim() || null,
        location: form.location?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        source: form.source?.trim() || null,
        notes: form.notes?.trim() || null,
      });
      setForm(initial);
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add this lead. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="lead-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div ref={panel} className="lead-dialog" role="dialog" aria-modal="true" aria-labelledby="add-lead-title">
        <header>
          <div>
            <span className="eyebrow">Lead intake</span>
            <h2 id="add-lead-title">Add organization Lead</h2>
            <p>Create the organization record first. Assignment and Lead Pool routing happen after the Lead is created.</p>
          </div>
          <button type="button" className="row-action" aria-label="Close Add Lead" onClick={onClose} disabled={saving}>×</button>
        </header>
        <form onSubmit={submit}>
          <div className="lead-form-body">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Input id="organization-name" label="Organization name" required value={form.organizationName} onChange={(event) => set('organizationName', event.target.value)} />
            <div className="lead-form-grid">
              <Input id="industry" label="Industry" value={form.industry ?? ''} onChange={(event) => set('industry', event.target.value)} />
              <Input id="website" label="Website" type="url" placeholder="https://example.com" value={form.website ?? ''} onChange={(event) => set('website', event.target.value)} />
              <Input id="organization-email" label="General email" type="email" value={form.email ?? ''} onChange={(event) => set('email', event.target.value)} />
              <Input id="phone" label="Phone" type="tel" value={form.phone ?? ''} onChange={(event) => set('phone', event.target.value)} />
            </div>
            <Input id="location" label="Location" placeholder="Lagos, Nigeria" value={form.location ?? ''} onChange={(event) => set('location', event.target.value)} />
            <div className="lead-form-grid">
              <Input id="source" label="Source" placeholder="Referral, event, research…" value={form.source ?? ''} onChange={(event) => set('source', event.target.value)} />
              <NativeSelect id="priority" label="Priority" value={form.priority} onChange={(event) => set('priority', event.target.value as LeadPriority)}>
                {LEAD_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}
              </NativeSelect>
            </div>
            <Textarea id="notes" label="Notes" rows={4} value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} />
            <Alert tone="info">
              New Leads start as <strong>New · Unassigned</strong>. The admin can either assign them directly or publish them to the shared Lead Pool for staff to pick.
            </Alert>
          </div>
          <footer>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>Create Lead</Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
