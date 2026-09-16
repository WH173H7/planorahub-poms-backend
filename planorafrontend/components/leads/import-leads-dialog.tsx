'use client';

import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { commitLeadImport, previewLeadImport } from '@/lib/leads/api';
import { downloadLeadImportTemplate, parseLeadImportFile } from '@/lib/leads/import-file';
import type { LeadImportCommitRow, LeadImportPreviewRow, LeadImportResult, LeadImportRow } from '@/lib/leads/types';

const columns = ['organization_name','industry','website','general_email','phone','location','source','priority','notes'] as const;
const labels: Record<string,string> = {
  organization_name:'Organization name', industry:'Industry', website:'Website', general_email:'General email',
  phone:'Phone', location:'Location', source:'Source', priority:'Priority', notes:'Notes',
};

export function ImportLeadsDialog({open,onClose,onImported}:{open:boolean;onClose:()=>void;onImported:()=>Promise<void>}) {
  const fileRef=useRef<HTMLInputElement>(null);
  const [fileName,setFileName]=useState('');
  const [parsed,setParsed]=useState<Array<Record<string,string>&{__rowNumber:string}>>([]);
  const [mapping,setMapping]=useState<Record<string,string>>({});
  const [preview,setPreview]=useState<LeadImportPreviewRow[]>([]);
  const [actions,setActions]=useState<Record<number,LeadImportCommitRow['action']>>({});
  const [step,setStep]=useState<'UPLOAD'|'MAP'|'PREVIEW'|'DONE'>('UPLOAD');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<LeadImportResult|null>(null);
  const headers=useMemo(()=>parsed.length?Object.keys(parsed[0]).filter((key)=>key!=='__rowNumber'):[],[parsed]);
  if(!open)return null;

  function reset(){setFileName('');setParsed([]);setMapping({});setPreview([]);setActions({});setStep('UPLOAD');setBusy(false);setError(null);setResult(null);}
  function close(){if(busy)return;reset();onClose();}
  async function chooseFile(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;setBusy(true);setError(null);
    try{const rows=await parseLeadImportFile(file);setFileName(file.name);setParsed(rows);const detected:Record<string,string>={};for(const col of columns){if(Object.prototype.hasOwnProperty.call(rows[0]??{},col))detected[col]=col;}setMapping(detected);setStep('MAP');}
    catch(caught){setError(caught instanceof Error?caught.message:'Unable to read import file.');}
    finally{setBusy(false);event.target.value='';}
  }
  function buildRows():LeadImportRow[]{return parsed.map((row)=>({
    rowNumber:Number(row.__rowNumber),organizationName:(row[mapping.organization_name]??'').trim(),industry:value(row,mapping.industry),website:value(row,mapping.website),
    email:value(row,mapping.general_email),phone:value(row,mapping.phone),location:value(row,mapping.location),source:value(row,mapping.source),
    priority:(value(row,mapping.priority)?.toUpperCase() as LeadImportRow['priority'])||'MEDIUM',notes:value(row,mapping.notes),
  }));}
  async function runPreview(){if(!mapping.organization_name){setError('Map the Organization name column first.');return;}setBusy(true);setError(null);try{const data=await previewLeadImport(buildRows());setPreview(data);setActions(Object.fromEntries(data.map((row)=>[row.rowNumber,row.defaultAction])));setStep('PREVIEW');}catch(caught){setError(caught instanceof Error?caught.message:'Unable to preview this import.');}finally{setBusy(false);}}
  async function commit(){setBusy(true);setError(null);try{const rows:LeadImportCommitRow[]=preview.map((row)=>({...row,action:actions[row.rowNumber]??row.defaultAction,existingOrganizationId:row.existingOrganization?.id??null}));const response=await commitLeadImport(rows);setResult(response);setStep('DONE');await onImported();}catch(caught){setError(caught instanceof Error?caught.message:'Unable to import these Leads.');}finally{setBusy(false);}}
  const counts=preview.reduce((acc,row)=>{acc[row.status]=(acc[row.status]??0)+1;return acc;},{} as Record<string,number>);

  return <div className="lead-dialog-layer" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)close();}}><div className="lead-dialog lead-import-dialog" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Lead intake</span><h2>Import organization Leads</h2><p>Upload CSV or XLSX, map organization details, review duplicates, then create clean Lead records.</p></div><button type="button" className="row-action" onClick={close} disabled={busy}>×</button></header><div className="lead-form-body">
    <div className="lead-import-steps"><span className={step==='UPLOAD'?'active':''}>1 Upload</span><span className={step==='MAP'?'active':''}>2 Map</span><span className={step==='PREVIEW'?'active':''}>3 Review</span><span className={step==='DONE'?'active':''}>4 Complete</span></div>
    {error?<Alert tone="error">{error}</Alert>:null}
    {step==='UPLOAD'?<section className="lead-import-upload"><div className="lead-import-guide"><div><span className="eyebrow">Before you upload</span><h3>One organization per row</h3><p>Lead intake is operational only. Revenue is deliberately captured later when a qualified Lead is submitted for Prospect review.</p></div><div className="lead-import-guide-grid"><div><strong>Required</strong><code>organization_name</code><small>The organization being researched or pursued.</small></div><div><strong>Optional columns</strong><code>industry · website · general_email · phone · location · source · priority · notes</code><small>Priority accepts LOW, MEDIUM, HIGH or URGENT.</small></div><div><strong>System controlled</strong><code>Lead · New · Unassigned</code><small>After import, Admin can assign directly or publish selected Leads to the shared Lead Pool.</small></div></div><div className="lead-import-sample"><strong>Example row</strong><div><code>Acme Limited</code><code>Technology</code><code>https://acme.example</code><code>hello@acme.example</code><code>+2348000000000</code><code>Lagos, Nigeria</code><code>Research</code><code>MEDIUM</code><code>Potential enterprise account</code></div></div></div><div className="lead-import-drop"><strong>CSV or XLSX</strong><p>Maximum 1,000 data rows.</p><input ref={fileRef} hidden type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile}/><Button onClick={()=>fileRef.current?.click()} loading={busy}>Choose file</Button></div><Button variant="outline" onClick={downloadLeadImportTemplate}>Download CSV template</Button></section>:null}
    {step==='MAP'?<section><div className="lead-import-file-summary"><strong>{fileName}</strong><span>{parsed.length} rows detected</span></div><div className="lead-import-map-grid">{columns.map((column)=><NativeSelect key={column} label={`${labels[column]}${column==='organization_name'?' *':''}`} value={mapping[column]??''} onChange={(event)=>setMapping((current)=>({...current,[column]:event.target.value}))}><option value="">Do not import</option>{headers.map((header)=><option key={header} value={header}>{header}</option>)}</NativeSelect>)}</div></section>:null}
    {step==='PREVIEW'?<section><div className="lead-import-preview-summary"><Badge tone="success">{counts.READY??0} ready</Badge><Badge tone="purple">{counts.EXISTING_ORGANIZATION??0} reuse organization</Badge><Badge tone="warning">{(counts.EXISTING_LEAD??0)+(counts.DUPLICATE_FILE??0)} skipped/review</Badge></div><div className="lead-import-table-wrap"><table className="lead-import-table"><thead><tr><th>Row</th><th>Organization</th><th>Priority</th><th>Status</th><th>Decision</th></tr></thead><tbody>{preview.map((row)=><tr key={row.rowNumber}><td>{row.rowNumber}</td><td><strong>{row.organizationName}</strong><small>{row.website||row.email||row.location||'—'}</small></td><td>{row.priority||'MEDIUM'}</td><td><ImportStatus row={row}/><small>{row.message}</small></td><td><NativeSelect aria-label={`Decision for row ${row.rowNumber}`} value={actions[row.rowNumber]??row.defaultAction} onChange={(event)=>setActions((current)=>({...current,[row.rowNumber]:event.target.value as LeadImportCommitRow['action']}))}><option value="SKIP">Skip</option>{row.status==='READY'?<option value="CREATE_NEW">Create new Lead</option>:null}{row.status==='EXISTING_ORGANIZATION'?<option value="USE_EXISTING">Use existing organization</option>:null}</NativeSelect></td></tr>)}</tbody></table></div></section>:null}
    {step==='DONE'&&result?<section className="lead-import-complete"><strong>Import complete</strong><p>{result.totalCreated} Lead{result.totalCreated===1?'':'s'} created. {result.totalSkipped} row{result.totalSkipped===1?'':'s'} skipped.</p><Alert tone="success">Imported Leads are New and Unassigned. Assign them directly or publish them to the Lead Pool.</Alert>{result.skipped.length?<Button variant="outline" onClick={()=>downloadSkipped(result)}>Download skipped-row report</Button>:null}</section>:null}
  </div><footer>{step==='UPLOAD'?<Button variant="outline" onClick={close}>Cancel</Button>:null}{step==='MAP'?<><Button variant="outline" onClick={()=>setStep('UPLOAD')} disabled={busy}>Back</Button><Button onClick={()=>void runPreview()} loading={busy}>Preview import</Button></>:null}{step==='PREVIEW'?<><Button variant="outline" onClick={()=>setStep('MAP')} disabled={busy}>Back</Button><Button onClick={()=>void commit()} loading={busy}>Import selected rows</Button></>:null}{step==='DONE'?<Button onClick={close}>Done</Button>:null}</footer></div></div>;
}
function downloadSkipped(result:LeadImportResult){const rows=[['row','organization_name','reason'],...result.skipped.map((item)=>[String(item.rowNumber),item.organizationName,item.reason])];const csv=rows.map((row)=>row.map((value)=>/[",\n]/.test(value)?`"${value.replace(/"/g,'""')}"`:value).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='planorahub-lead-import-skipped.csv';anchor.click();URL.revokeObjectURL(url);}
function value(row:Record<string,string>,header?:string){const result=header?(row[header]??'').trim():'';return result||null;}
function ImportStatus({row}:{row:LeadImportPreviewRow}){const tone=row.status==='READY'?'success':row.status==='EXISTING_ORGANIZATION'?'purple':'warning';const label=row.status==='READY'?'Ready':row.status==='EXISTING_ORGANIZATION'?'Existing organization':row.status==='EXISTING_LEAD'?'Existing Lead':'Duplicate in file';return <Badge tone={tone}>{label}</Badge>;}
