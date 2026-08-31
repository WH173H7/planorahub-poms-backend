'use client';

import Link from 'next/link';
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageErrorState, PageLoadingState } from '@/components/ui/page-state';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { deleteContact, getLead, getLeadPursuit, listLeadActivities, listLeadContacts, updatePursuitStep, uploadPursuitEvidence } from '@/lib/leads/api';
import { formatDate, organizationLocation, ownerName, priorityLabel, stageLabel } from '@/lib/leads/helpers';
import type { Activity, Contact, ContactMethod, Lead, Pursuit, PursuitStep } from '@/lib/leads/types';
import { ContactDialog, methodTypeLabel } from './add-contact-dialog';
import { LeadPriorityPill, LeadStagePill } from './lead-status';

type WorkspaceTab = 'overview' | 'research' | 'contacts' | 'pursuit' | 'activity';
type PursuitMutationHandler = (pursuit: Pursuit) => Promise<void>;

export function LeadWorkspace({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pursuit, setPursuit] = useState<Pursuit | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const refreshLead = useCallback(async () => {
    const record = await getLead(leadId);
    setLead(record);
    return record;
  }, [leadId]);

  const refreshWorkspace = useCallback(async () => {
    setError(null);
    try {
      const record = await refreshLead();
      const [contactData, pursuitData, activityData] = await Promise.all([
        listLeadContacts(record.organization_id),
        getLeadPursuit(leadId),
        listLeadActivities(leadId),
      ]);
      setContacts(contactData);
      setPursuit(pursuitData);
      setActivities(activityData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load this lead.');
    } finally {
      setLoading(false);
    }
  }, [leadId, refreshLead]);

  const handlePursuitMutation = useCallback<PursuitMutationHandler>(async (updatedPursuit) => {
    setPursuit(updatedPursuit);
    await refreshLead();
  }, [refreshLead]);

  useEffect(() => { Promise.resolve().then(refreshWorkspace); }, [refreshWorkspace]);

  const researchStep = useMemo(
    () => pursuit?.steps.find((step) => step.title.toLowerCase().includes('research')) ?? null,
    [pursuit],
  );

  if (loading) return <AppShell area="admin" title="Lead Workspace" breadcrumb="Sales / Leads"><PageLoadingState /></AppShell>;
  if (error || !lead) return <AppShell area="admin" title="Lead Workspace" breadcrumb="Sales / Leads"><PageErrorState message={error ?? 'Lead not found.'} /></AppShell>;

  const tabs: Array<{ value: WorkspaceTab; label: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'research', label: 'Research' },
    { value: 'contacts', label: `Contacts (${contacts.length})` },
    { value: 'pursuit', label: 'Pursuit' },
    { value: 'activity', label: `Activity (${activities.length})` },
  ];

  return (
    <AppShell area="admin" title={lead.organization_name} breadcrumb="Sales / Leads">
      <div className="lead-workspace">
        <Link href="/leads" className="back-link">← Leads</Link>
        <RecordHeader lead={lead} />
        <div className="record-tabs" role="tablist">
          {tabs.map((item) => <button key={item.value} role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)}>{item.label}</button>)}
        </div>
        {tab === 'overview' && <Overview lead={lead} />}
        {tab === 'research' && <Research leadId={leadId} pursuit={pursuit} step={researchStep} onChanged={handlePursuitMutation} />}
        {tab === 'contacts' && <Contacts contacts={contacts} onAdd={() => { setEditingContact(null); setContactOpen(true); }} onEdit={(contact) => { setEditingContact(contact); setContactOpen(true); }} onDelete={async (contact) => { const name = `${contact.first_name} ${contact.last_name}`.trim(); if (!window.confirm(`Delete ${name}? This will also remove their contact methods.`)) return; await deleteContact(contact.id); setContacts(await listLeadContacts(lead.organization_id)); }} />}
        {tab === 'pursuit' && <PursuitView leadId={leadId} pursuit={pursuit} onChanged={handlePursuitMutation} />}
        {tab === 'activity' && <ActivityView activities={activities} />}
        {contactOpen ? <ContactDialog
          key={editingContact?.id ?? 'new-contact'}
          open
          organizationId={lead.organization_id}
          contact={editingContact}
          onClose={() => { setContactOpen(false); setEditingContact(null); }}
          onSaved={async () => {
            setContacts(await listLeadContacts(lead.organization_id));
            setContactOpen(false);
            setEditingContact(null);
          }}
        /> : null}
      </div>
    </AppShell>
  );
}

function RecordHeader({ lead }: { lead: Lead }) {
  return (
    <Card className="record-header">
      <div className="record-title"><div><span className="eyebrow">Organization lead</span><h1>{lead.organization_name}</h1><p>{[lead.industry, organizationLocation(lead)].filter(Boolean).join(' · ') || 'Organization pursuit'}</p></div><Badge tone="purple">LEAD</Badge></div>
      <div className="record-meta">
        <HeaderMeta label="Stage"><LeadStagePill stage={lead.stage} /></HeaderMeta>
        <HeaderMeta label="Owner" value={ownerName(lead)} />
        <HeaderMeta label="Priority"><LeadPriorityPill priority={lead.priority} /></HeaderMeta>
        <HeaderMeta label="Progress"><span>{lead.pursuit_progress}%</span><Progress value={lead.pursuit_progress} /></HeaderMeta>
        <HeaderMeta label="Next follow-up" value={lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : '—'} />
        <HeaderMeta label="Assignment" value={lead.current_assignment_title || '—'} />
      </div>
    </Card>
  );
}

function HeaderMeta({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return <div><span className="record-meta-label">{label}</span><div className="record-meta-value">{children ?? value ?? '—'}</div></div>;
}

function Overview({ lead }: { lead: Lead }) {
  const fields: Array<[string, string | null]> = [
    ['Organization', lead.organization_name], ['Lifecycle', 'LEAD'], ['Stage', stageLabel(lead.stage)],
    ['Priority', priorityLabel(lead.priority)], ['Owner', ownerName(lead)], ['Pursuit progress', `${lead.pursuit_progress}%`],
    ['Assignment', lead.current_assignment_title], ['Assignment deadline', lead.current_assignment_due_at ? formatDate(lead.current_assignment_due_at) : null],
    ['Website', lead.organization_website], ['Industry', lead.industry], ['Organization email', lead.organization_email],
    ['Organization phone', lead.organization_phone], ['Location', organizationLocation(lead)], ['Source', lead.source],
    ['Created', formatDate(lead.created_at)], ['Next action', lead.next_action],
    ['Next follow-up', lead.next_follow_up_at ? formatDate(lead.next_follow_up_at) : null],
  ];
  return <Card className="workspace-card"><header><div><h2>Lead overview</h2><p>Current organization and pursuit information.</p></div></header><dl className="detail-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></Card>;
}

function Research({ leadId, pursuit, step, onChanged }: { leadId: string; pursuit: Pursuit | null; step: PursuitStep | null; onChanged: PursuitMutationHandler }) {
  if (!pursuit) return <Card><EmptyState icon="search" title="Research begins after assignment" description="A pursuit workflow and its research step will appear when this lead is assigned through the existing workflow." /></Card>;
  if (!step) return <Card><EmptyState icon="search" title="No research step in this workflow" description="Review the Pursuit tab for the steps configured on this assigned lead." /></Card>;
  return <StepEditor leadId={leadId} step={step} onChanged={onChanged} prominent />;
}

function PursuitView({ leadId, pursuit, onChanged }: { leadId: string; pursuit: Pursuit | null; onChanged: PursuitMutationHandler }) {
  if (!pursuit) return <Card><EmptyState icon="workflow" title="No pursuit workflow yet" description="The pursuit workspace begins after this lead is assigned through a workflow." /></Card>;
  return <div className="pursuit-list">{pursuit.steps.map((step) => <StepEditor key={step.id} leadId={leadId} step={step} onChanged={onChanged} />)}</div>;
}

function StepEditor({ leadId, step, onChanged, prominent = false }: { leadId: string; step: PursuitStep; onChanged: PursuitMutationHandler; prominent?: boolean }) {
  const [notes, setNotes] = useState(step.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(completed = step.completed) {
    setSaving(true); setMessage(null);
    try { await onChanged(await updatePursuitStep(leadId, step.id, { completed, notes: notes || null })); setMessage('Step updated.'); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Unable to update step.'); }
    finally { setSaving(false); }
  }

  async function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMessage('Evidence files must be 10 MB or smaller.'); return; }
    setSaving(true); setMessage(null);
    try {
      await uploadPursuitEvidence(leadId, step.id, file);
      const updated = await getLeadPursuit(leadId);
      if (updated) await onChanged(updated);
      setMessage('Evidence uploaded.');
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Evidence upload failed.'); }
    finally { setSaving(false); event.target.value = ''; }
  }

  return (
    <Card className={`workspace-card step-card ${prominent ? 'research-card' : ''}`}>
      <header><div><span className="eyebrow">Step {step.position}</span><h2>{step.title}</h2><p>{step.description || 'No description provided.'}</p></div><Badge tone={step.completed ? 'success' : 'neutral'}>{step.completed ? 'Complete' : 'Incomplete'}</Badge></header>
      {step.completed_at ? <p className="muted">Completed {formatDate(step.completed_at)}{step.completed_by_first_name ? ` by ${step.completed_by_first_name} ${step.completed_by_last_name ?? ''}` : ''}</p> : null}
      <Textarea label="Working notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} />
      <div className="evidence-block"><strong>Evidence {step.evidence_required ? 'required' : 'optional'}</strong>{step.evidence.length ? <ul>{step.evidence.map((file) => <li key={file.id}>{file.file_name} · {Math.ceil(file.file_size / 1024)} KB · {formatDate(file.created_at)}</li>)}</ul> : <p className="muted">No evidence uploaded.</p>}<label className="ui-button ui-button--outline ui-button--sm evidence-upload">Upload evidence<input type="file" onChange={fileChanged} disabled={saving} /></label></div>
      {message ? <Alert tone={message.includes('failed') || message.includes('must') ? 'error' : 'success'}>{message}</Alert> : null}
      <footer><Button variant="outline" onClick={() => void save()} loading={saving}>Save notes</Button><Button onClick={() => void save(!step.completed)} loading={saving}>{step.completed ? 'Reopen step' : 'Mark complete'}</Button></footer>
    </Card>
  );
}

function Contacts({ contacts, onAdd, onEdit, onDelete }: { contacts: Contact[]; onAdd: () => void; onEdit: (contact: Contact) => void; onDelete: (contact: Contact) => Promise<void> }) {
  return <Card className="workspace-card"><header><div><h2>Organization contacts</h2><p>People attached to this organization and available across PlanoraHub Contacts.</p></div><Button onClick={onAdd}>+ Add Contact</Button></header>{contacts.length === 0 ? <EmptyState icon="contacts" title="No contact identified yet" description="Identify a relevant person at this organization before outreach." action={<Button onClick={onAdd}>+ Add Contact</Button>} /> : <div className="contact-list">{contacts.map((contact) => <article key={contact.id}><div className="contact-heading"><div><strong>{contact.first_name} {contact.last_name}</strong>{contact.is_primary ? <Badge tone="purple">Primary</Badge> : null}<p>{contact.job_title || 'Role not provided'}</p></div><div className="contact-card-actions"><button type="button" className="contact-icon-action" aria-label={`Edit ${contact.first_name} ${contact.last_name}`} title="Edit contact" onClick={() => onEdit(contact)}><EditIcon /></button><button type="button" className="contact-icon-action contact-icon-action-danger" aria-label={`Delete ${contact.first_name} ${contact.last_name}`} title="Delete contact" onClick={() => { void onDelete(contact); }}><TrashIcon /></button></div></div>{contact.methods.length ? <dl className="contact-method-list">{contact.methods.map(method => <ContactMethodRow key={method.id} method={method} />)}</dl> : <p className="muted">No contact methods recorded.</p>}{contact.notes ? <p>{contact.notes}</p> : null}</article>)}</div>}</Card>;
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.83 2.83 0 0 0-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="m13.5 6.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function ContactMethodRow({method}:{method:ContactMethod}){
  const href=contactMethodHref(method);
  const value=href?<a href={href} target={href.startsWith('http')?'_blank':undefined} rel={href.startsWith('http')?'noreferrer':undefined}>{method.value}</a>:method.value;
  const tone=method.verification_status==='VERIFIED'?'success':method.verification_status==='INVALID'?'danger':'neutral';
  return <div><dt>{method.legacy_source ? methodTypeLabel(method.type) : (method.label || methodTypeLabel(method.type))}</dt><dd><span>{value}</span><Badge tone={tone}>{method.verification_status[0]+method.verification_status.slice(1).toLowerCase()}</Badge></dd>{method.notes?<p>{method.notes}</p>:null}</div>;
}

function contactMethodHref(method:ContactMethod){
  if(method.type==='EMAIL')return `mailto:${method.value}`;
  if(method.type==='PHONE')return `tel:${method.value}`;
  if(/^https?:\/\//i.test(method.value))return method.value;
  return undefined;
}

function ActivityView({ activities }: { activities: Activity[] }) {
  return <Card className="workspace-card"><header><div><h2>Lead activity</h2><p>Repeatable calls, meetings, emails, follow-ups and notes scoped to this lead.</p></div></header>{activities.length === 0 ? <EmptyState icon="activity" title="No activity recorded" description="Activities linked to this lead will form its relationship timeline." /> : <ol className="activity-timeline">{activities.map((activity) => <li key={activity.id}><time>{formatDate(activity.scheduled_at || activity.completed_at || activity.created_at)}</time><div><div><Badge tone="neutral">{activity.activity_type.replace('_', ' ')}</Badge><Badge tone={activity.status === 'COMPLETED' ? 'success' : activity.status === 'CANCELLED' ? 'danger' : 'warning'}>{activity.status.replace('_', ' ')}</Badge></div><strong>{activity.title}</strong>{activity.description ? <p>{activity.description}</p> : null}{activity.outcome ? <p><b>Outcome:</b> {activity.outcome}</p> : null}</div></li>)}</ol>}</Card>;
}
