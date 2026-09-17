'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {EmptyState} from '@/components/ui/empty-state';
import {listPendingLetterApprovals,reviewLetter,type LetterDocument} from '@/lib/workspace/api';
import {formatDate} from '@/lib/leads/helpers';

export function LetterApprovalsView(){
  const [rows,setRows]=useState<LetterDocument[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [reviewNote,setReviewNote]=useState('');
  async function load(){try{const data=await listPendingLetterApprovals();setRows(data);if(!selectedId&&data[0])setSelectedId(data[0].id);if(selectedId&&!data.some(x=>x.id===selectedId))setSelectedId(data[0]?.id??null);setError(null)}catch(e){setError(e instanceof Error?e.message:'Unable to load letter approvals')}}
  useEffect(()=>{void load()},[]);
  const selected=useMemo(()=>rows.find(x=>x.id===selectedId)??null,[rows,selectedId]);
  async function decide(status:'APPROVED'|'CHANGES_REQUESTED'|'REJECTED'){
    if(!selected)return;setBusy(true);try{await reviewLetter(selected.id,status,reviewNote.trim()||undefined);setReviewNote('');await load()}finally{setBusy(false)}
  }
  return <AppShell area="admin" title="Letter Approval Inbox" breadcrumb="Communication / Official Letters" description="Review official correspondence before it can be issued outside PlanoraHub." actions={<><Link href="/letterhead"><Button variant="outline">Official Letters</Button></Link><Link href="/letterhead/approval-rules"><Button variant="outline">Approval rules</Button></Link></>}>
    <div className="letter-approval-page">
      <div className="letter-approval-summary"><Card><span>Awaiting approval</span><strong>{rows.length}</strong><small>Official letters requiring final review</small></Card><Card><span>Oldest request</span><strong>{rows[0]?.submitted_for_approval_at?formatDate(rows[0].submitted_for_approval_at):'—'}</strong><small>Review oldest requests first</small></Card></div>
      {error?<Card className="workspace-card"><p className="task-form-error">{error}</p></Card>:null}
      {rows.length?<div className="letter-approval-layout"><aside className="letter-approval-list">{rows.map(letter=><button key={letter.id} type="button" className={selectedId===letter.id?'is-active':''} onClick={()=>{setSelectedId(letter.id);setReviewNote('')}}><div><strong>{letter.title}</strong><span>{letter.recipient_name||letter.recipient_organization||'No recipient'}</span></div><Badge tone="warning">Review</Badge><small>{[letter.creator_first_name,letter.creator_last_name].filter(Boolean).join(' ')||'Staff'} · {letter.submitted_for_approval_at?formatDate(letter.submitted_for_approval_at):'Submitted'}</small></button>)}</aside>{selected?<main className="letter-approval-detail"><Card className="workspace-card letter-approval-document"><header><div><span className="eyebrow">Approval review</span><h2>{selected.title}</h2><p>{selected.subject||'Official correspondence'}</p></div><Badge tone="warning">Pending approval</Badge></header><div className="letter-approval-meta"><div><span>Author</span><strong>{[selected.creator_first_name,selected.creator_last_name].filter(Boolean).join(' ')||'Staff'}</strong><small>{selected.creator_role_name||''}{selected.creator_department_name?` · ${selected.creator_department_name}`:''}</small></div><div><span>Recipient</span><strong>{selected.recipient_name||selected.recipient_organization||'Not specified'}</strong><small>{selected.recipient_organization||''}</small></div><div><span>Related CRM record</span><strong>{selected.organization_name||selected.lead_title||'None'}</strong><small>{selected.lead_title?'Lead / Prospect context':'No Lead link'}</small></div><div><span>Submitted</span><strong>{selected.submitted_for_approval_at?formatDate(selected.submitted_for_approval_at):'—'}</strong></div></div><div className="letter-approval-body"><span className="eyebrow">Letter body</span><p>{selected.body||'No body text.'}</p></div><label className="letter-approval-note"><span>Review note / rejection reason</span><textarea rows={4} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Optional for approval. Required when rejecting; add clear instructions when requesting changes."/></label><div className="letter-approval-actions"><Link href={`/letterhead?letter=${selected.id}`}><Button variant="outline">Open full letter</Button></Link><Button variant="outline" loading={busy} onClick={()=>void decide('CHANGES_REQUESTED')}>Request changes</Button><Button variant="outline" loading={busy} disabled={!reviewNote.trim()} onClick={()=>void decide('REJECTED')}>Reject</Button><Button loading={busy} onClick={()=>void decide('APPROVED')}>Approve letter</Button></div></Card></main>:null}</div>:<EmptyState icon="reports" title="Approval inbox is clear" description="Letters that require final Admin approval will appear here when staff submit them."/>}
    </div>
  </AppShell>
}
