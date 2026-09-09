'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import {
  createOrganization,
  updateOrganization,
  type Organization,
} from '@/lib/organizations/api';

type OrganizationForm = {
  name: string;
  legalName: string;
  industry: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  city: string;
  state: string;
  country: string;
  notes: string;
};

function initialForm(organization?: Organization | null): OrganizationForm {
  return {
    name: organization?.name ?? '',
    legalName: organization?.legal_name ?? '',
    industry: organization?.industry ?? '',
    email: organization?.email ?? '',
    phone: organization?.phone ?? '',
    website: organization?.website ?? '',
    addressLine1: organization?.address_line1 ?? '',
    city: organization?.city ?? '',
    state: organization?.state ?? '',
    country: organization?.country ?? '',
    notes: organization?.notes ?? '',
  };
}

function OrganizationFormContent({
  organization,
  onClose,
  onSaved,
}: {
  organization?: Organization | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OrganizationForm>(() => initialForm(organization));

  const set = (key: keyof OrganizationForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (organization) {
        await updateOrganization(organization.id, form);
      } else {
        await createOrganization({ ...form, organizationType: 'OTHER' });
      }
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save organization.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Input label="Organization name *" value={form.name} onChange={(event) => set('name', event.target.value)} required />
        <Input label="Legal name" value={form.legalName} onChange={(event) => set('legalName', event.target.value)} />
        <Input label="Industry" value={form.industry} onChange={(event) => set('industry', event.target.value)} />
        <Input label="Website" value={form.website} onChange={(event) => set('website', event.target.value)} />
        <Input label="General email" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} />
        <Input label="Phone" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
        <Input label="Address" value={form.addressLine1} onChange={(event) => set('addressLine1', event.target.value)} />
        <Input label="City" value={form.city} onChange={(event) => set('city', event.target.value)} />
        <Input label="State" value={form.state} onChange={(event) => set('state', event.target.value)} />
        <Input label="Country" value={form.country} onChange={(event) => set('country', event.target.value)} />
      </div>
      <Textarea label="Institutional notes" rows={4} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
      {error ? <p style={{ color: 'var(--danger, #a42323)', margin: 0 }}>{error}</p> : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving}>{organization ? 'Save changes' : 'Create organization'}</Button>
      </div>
    </form>
  );
}

export function OrganizationFormDialog({
  open,
  onClose,
  onSaved,
  organization,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  organization?: Organization | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={organization ? 'Edit organization' : 'New organization'}>
      {open ? (
        <OrganizationFormContent
          key={organization?.id ?? 'new-organization'}
          organization={organization}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  );
}
