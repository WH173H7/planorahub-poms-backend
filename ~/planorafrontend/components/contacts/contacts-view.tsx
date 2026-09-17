'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { createContact, createMethod, deleteContact, deleteMethod, listContacts, listMethods, updateContact, updateMethod, type Contact, type ContactMethod } from '@/lib/contacts/api';
import { listOrganizations } from '@/lib/organizations/api';

type Org = { id:string; name:string };

export function ContactsView() {
  const [rows,setRows]=useState<Contact[]>([]);
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [query,setQuery]=useState('');
  const [org,setOrg]=useState('');
  const [edit,setEdit]=useState<Contact|null|undefined>(undefined);
  const [methodsFor,setMethodsFor]=useState<Contact|null>(null);
  const [error,setError]=useState<string|null>(null);

  async function load(){
    try{const[contactRows,organizations]=await Promise.all([listContacts(),listOrganizations()]);setRows(contactRows);setOrgs(organizations);setError(null)}
    catch(caught){setError(caught instanceof Error?caught.message:'Unable to load contacts.')}
  }

  useEffect(()=>{let active=true;Promise.all([listContacts(),listOrganizations()]).then(([contactRows,organizations])=>{if(active){setRows(contactRows);setOrgs(organizations)}}).catch(caught=>active&&setError(caught instanceof Error?caught.message:'Unable to load contacts.'));return()=>{active=false}},[]);

  const visible=useMemo(()=>rows.filter(contact=>(!org||contact.organization_id===org)&&(!query.trim()||[contact.first_name,contact.last_name,contact.job_title,contact.organization_name,contact.email,contact.phone].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()))),[rows,query,org]);

  return (
    <AppShell area="admin" title="Contacts" breadcrumb="Core CRM" description="People stay attached to one Organization, with multiple verified contact methods." actions={<Button onClick={()=>setEdit(null)}>+ New Contact</Button>}>
      <div className="page-stack contacts-page">
        <Card><div className="ui-card-content crm-filter-grid"><Input aria-label="Search contacts" placeholder="Search person, role, organization…" value={query} onChange={event=>setQuery(event.target.value)}/><NativeSelect aria-label="Filter by organization" value={org} onChange={event=>setOrg(event.target.value)}><option value="">All organizations</option>{orgs.map(organization=><option key={organization.id} value={organization.id}>{organization.name}</option>)}</NativeSelect></div></Card>
        {error?<Card><div className="ui-card-content task-form-error">{error}</div></Card>:visible.length===0?<Card><EmptyState icon="contacts" title="No contacts found" description="Add a person under an Organization, then store their email, phone or social contact methods."/></Card>:<>
          <Card className="crm-desktop-table"><div className="table-wrap"><table className="ui-table"><thead><tr><th>Person</th><th>Organization</th><th>Role</th><th>Primary contact</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(contact=><tr key={contact.id}><td><strong>{contact.first_name} {contact.last_name}</strong>{contact.is_primary?<div><Badge tone="purple">Primary person</Badge></div>:null}</td><td><Link href={`/organizations/${contact.organization_id}`} className="crm-open-link">{contact.organization_name}</Link></td><td>{contact.job_title||'—'}</td><td>{contact.email||contact.phone||'Methods available'}</td><td><ContactActions contact={contact} onMethods={()=>setMethodsFor(contact)} onEdit={()=>setEdit(contact)} onDelete={async()=>{if(!window.confirm(`Delete ${contact.first_name} ${contact.last_name}?`))return;await deleteContact(contact.id);await load()}}/></td></tr>)}</tbody></table></div></Card>
          <div className="crm-mobile-list">{visible.map(contact=><Card key={contact.id}><div className="crm-mobile-card"><div className="crm-mobile-card-head"><div><strong>{contact.first_name} {contact.last_name}</strong><span>{contact.job_title||'Role not recorded'}</span></div>{contact.is_primary?<Badge tone="purple">Primary</Badge>:null}</div><dl className="crm-mobile-meta"><div><dt>Organization</dt><dd>{contact.organization_name}</dd></div><div><dt>Contact</dt><dd>{contact.email||contact.phone||'Methods available'}</dd></div></dl><ContactActions mobile contact={contact} onMethods={()=>setMethodsFor(contact)} onEdit={()=>setEdit(contact)} onDelete={async()=>{if(!window.confirm(`Delete ${contact.first_name} ${contact.last_name}?`))return;await deleteContact(contact.id);await load()}}/></div></Card>)}</div>
        </>}
      </div>
      {edit!==undefined?<ContactForm contact={edit} organizations={orgs} onClose={()=>setEdit(undefined)} onSaved={async()=>{setEdit(undefined);await load()}}/>:null}
      {methodsFor?<MethodsDialog contact={methodsFor} onClose={()=>setMethodsFor(null)}/>:null}
    </AppShell>
  );
}

function ContactActions({contact,onMethods,onEdit,onDelete,mobile=false}:{contact:Contact;onMethods:()=>void;onEdit:()=>void;onDelete:()=>Promise<void>;mobile?:boolean}){
  return <div className={mobile?'crm-mobile-actions':'table-actions'}>{contact.email?<Link href={`/email?compose=1&to=${encodeURIComponent(contact.email)}`}><Button size="sm" variant="outline">Email</Button></Link>:null}<Button size="sm" variant="outline" onClick={onMethods}>Methods</Button><Button size="sm" variant="outline" onClick={onEdit}>Edit</Button><Button size="sm" variant="danger" onClick={()=>void onDelete()}>Delete</Button></div>
}

function ContactForm({contact,organizations,onClose,onSaved}:{contact:Contact|null;organizations:Org[];onClose:()=>void;onSaved:()=>Promise<void>}){
  const[form,setForm]=useState({organizationId:contact?.organization_id||'',firstName:contact?.first_name||'',lastName:contact?.last_name||'',jobTitle:contact?.job_title||'',email:contact?.email||'',phone:contact?.phone||'',isPrimary:contact?.is_primary||false,notes:contact?.notes||''});
  const[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
  const set=(key:string,value:unknown)=>setForm(current=>({...current,[key]:value}));
  return <Modal open onClose={onClose} title={contact?'Edit Contact':'New Contact'}><form className="stack" onSubmit={async event=>{event.preventDefault();setSaving(true);try{if(contact)await updateContact(contact.id,form);else await createContact(form);await onSaved()}catch(caught){setError(caught instanceof Error?caught.message:'Unable to save contact.');setSaving(false)}}}><NativeSelect label="Organization *" value={form.organizationId} onChange={event=>set('organizationId',event.target.value)} required><option value="">Select organization</option>{organizations.map(organization=><option key={organization.id} value={organization.id}>{organization.name}</option>)}</NativeSelect><div className="polish-form-grid"><Input label="First name *" value={form.firstName} onChange={event=>set('firstName',event.target.value)} required/><Input label="Last name *" value={form.lastName} onChange={event=>set('lastName',event.target.value)} required/><Input label="Job title" value={form.jobTitle} onChange={event=>set('jobTitle',event.target.value)}/><Input label="Email (legacy quick field)" type="email" value={form.email} onChange={event=>set('email',event.target.value)}/><Input label="Phone (legacy quick field)" value={form.phone} onChange={event=>set('phone',event.target.value)}/></div><label className="inline-check"><input type="checkbox" checked={form.isPrimary} onChange={event=>set('isPrimary',event.target.checked)}/> Primary contact for this Organization</label>{error?<p className="task-form-error">{error}</p>:null}<div className="polish-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} type="submit">Save</Button></div></form></Modal>
}

function MethodsDialog({contact,onClose}:{contact:Contact;onClose:()=>void}){
  const[methods,setMethods]=useState<ContactMethod[]>([]),[loading,setLoading]=useState(true),[adding,setAdding]=useState(false),[form,setForm]=useState({type:'EMAIL',value:'',label:'',verificationStatus:'UNVERIFIED',isPrimary:false});
  async function load(){setMethods(await listMethods(contact.id));setLoading(false)}
  useEffect(()=>{let active=true;listMethods(contact.id).then(rows=>{if(active){setMethods(rows);setLoading(false)}});return()=>{active=false}},[contact.id]);
  async function saveMethod(){if(!form.value.trim())return;await createMethod(contact.id,{...form,value:form.value.trim()});setForm({type:'EMAIL',value:'',label:'',verificationStatus:'UNVERIFIED',isPrimary:false});setAdding(false);await load()}
  return <Modal open onClose={onClose} title={`${contact.first_name} ${contact.last_name} · Contact Methods`}><div className="stack"><div className="dialog-inline-head"><p className="ui-help">One person can have multiple emails, phones and social accounts. Verification is recorded per method.</p><Button size="sm" onClick={()=>setAdding(current=>!current)}>{adding?'Cancel':'+ Add Method'}</Button></div>{adding?<Card><div className="ui-card-content stack"><div className="contact-method-form-row contact-method-form-row--wide"><NativeSelect label="Type" value={form.type} onChange={event=>setForm(current=>({...current,type:event.target.value}))}>{['EMAIL','PHONE','LINKEDIN','X','INSTAGRAM','FACEBOOK','WEBSITE','OTHER'].map(type=><option key={type}>{type}</option>)}</NativeSelect><Input label="Value *" value={form.value} onChange={event=>setForm(current=>({...current,value:event.target.value}))}/></div><div className="contact-method-form-row"><Input label="Label" placeholder="Work, Direct, Main…" value={form.label} onChange={event=>setForm(current=>({...current,label:event.target.value}))}/><NativeSelect label="Verification" value={form.verificationStatus} onChange={event=>setForm(current=>({...current,verificationStatus:event.target.value}))}><option>UNVERIFIED</option><option>VERIFIED</option><option>INVALID</option></NativeSelect></div><label className="inline-check"><input type="checkbox" checked={form.isPrimary} onChange={event=>setForm(current=>({...current,isPrimary:event.target.checked}))}/> Primary {form.type.toLowerCase()} method</label><div><Button size="sm" onClick={()=>void saveMethod()}>Save Method</Button></div></div></Card>:null}{loading?<p>Loading…</p>:methods.length?<div className="contact-method-list-polished">{methods.map(method=><div key={method.id} className="contact-method-row"><div><strong>{method.type}{method.is_primary?' · Primary':''}</strong><span>{method.value}</span><small>{method.label||'No label'}</small></div><div className="contact-method-row-actions"><NativeSelect value={method.verification_status} onChange={async event=>{await updateMethod(contact.id,method.id,{type:method.type,value:method.value,label:method.label,isPrimary:method.is_primary,notes:method.notes,verificationStatus:event.target.value});await load()}}><option>UNVERIFIED</option><option>VERIFIED</option><option>INVALID</option></NativeSelect><Button size="sm" variant="danger" onClick={async()=>{if(!window.confirm('Delete this contact method?'))return;await deleteMethod(contact.id,method.id);await load()}}>Delete</Button></div></div>)}</div>:<p className="ui-help">No contact methods yet.</p>}<div className="polish-actions"><Button variant="outline" onClick={onClose}>Close</Button></div></div></Modal>
}
