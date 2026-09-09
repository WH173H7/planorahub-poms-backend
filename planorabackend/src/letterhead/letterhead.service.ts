import {BadRequestException,Injectable,NotFoundException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service.js';
import {AuditService} from '../audit/audit.service.js';
import {LETTERHEAD_LOGO_HEIGHT,LETTERHEAD_LOGO_JPEG_BASE64,LETTERHEAD_LOGO_WIDTH} from './letterhead-logo.asset.js';
type Ctx={actorUserId?:string;ipAddress?:string;userAgent?:string};
type LetterInput={title?:string;referenceNumber?:string|null;letterDate?:string;recipientName?:string|null;recipientOrganization?:string|null;recipientAddress?:string|null;subject?:string|null;body?:string;closing?:string|null;signatoryName?:string|null;signatoryTitle?:string|null;signatureDataUrl?:string|null;signatureScale?:number;signatureOffsetX?:number;signatureOffsetY?:number};
@Injectable()
export class LetterheadService{
 constructor(private readonly db:DatabaseService,private readonly audit:AuditService){}
 async settings(){return (await this.db.query(`SELECT * FROM letterhead_settings WHERE singleton_key='DEFAULT' LIMIT 1`)).rows[0]}
 async updateSettings(body:any,ctx?:Ctx){const current=await this.settings();const values={organizationName:String(body.organizationName??current.organization_name??'PlanoraHub').trim(),tagline:this.clean(body.tagline),address:this.clean(body.address),email:this.clean(body.email),phone:this.clean(body.phone),website:this.clean(body.website),footerText:this.clean(body.footerText),signatoryName:this.clean(body.signatoryName),signatoryTitle:this.clean(body.signatoryTitle)};const row=(await this.db.query(`UPDATE letterhead_settings SET organization_name=$1,tagline=$2,address=$3,email=$4,phone=$5,website=$6,footer_text=$7,signatory_name=$8,signatory_title=$9,updated_by_id=$10,updated_at=NOW() WHERE singleton_key='DEFAULT' RETURNING *`,[values.organizationName,values.tagline,values.address,values.email,values.phone,values.website,values.footerText,values.signatoryName,values.signatoryTitle,ctx?.actorUserId??null])).rows[0];await this.audit.log({actorUserId:ctx?.actorUserId,action:'LETTERHEAD_SETTINGS_UPDATED',module:'communications',entityType:'letterhead_settings',entityId:String(row.id),newValues:row,ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});return row}
 async list(userId:string){return (await this.db.query(`SELECT d.*,u.first_name AS creator_first_name,u.last_name AS creator_last_name FROM letter_documents d LEFT JOIN users u ON u.id=d.created_by_id WHERE d.created_by_id=$1 OR EXISTS(SELECT 1 FROM users me JOIN roles r ON r.id=me.role_id WHERE me.id=$1 AND r.code='SUPER_ADMIN') ORDER BY d.updated_at DESC`,[userId])).rows}
 async get(id:string){const row=(await this.db.query(`SELECT * FROM letter_documents WHERE id=$1 LIMIT 1`,[id])).rows[0];if(!row)throw new NotFoundException('Letter not found');return row}
 async getForUser(id:string,userId:string){const row=(await this.db.query(`SELECT d.* FROM letter_documents d WHERE d.id=$1 AND (d.created_by_id=$2 OR EXISTS(SELECT 1 FROM users me JOIN roles r ON r.id=me.role_id WHERE me.id=$2 AND r.code='SUPER_ADMIN')) LIMIT 1`,[id,userId])).rows[0];if(!row)throw new NotFoundException('Letter not found');return row}
 async create(input:LetterInput,ctx?:Ctx){const d=this.validate(input);const row=(await this.db.query(`INSERT INTO letter_documents(title,reference_number,letter_date,recipient_name,recipient_organization,recipient_address,subject,body,closing,signatory_name,signatory_title,signature_data_url,signature_scale,signature_offset_x,signature_offset_y,created_by_id,updated_by_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING *`,[d.title,d.referenceNumber,d.letterDate,d.recipientName,d.recipientOrganization,d.recipientAddress,d.subject,d.body,d.closing,d.signatoryName,d.signatoryTitle,d.signatureDataUrl,d.signatureScale,d.signatureOffsetX,d.signatureOffsetY,ctx?.actorUserId??null])).rows[0];await this.audit.log({actorUserId:ctx?.actorUserId,action:'LETTER_CREATED',module:'communications',entityType:'letter_document',entityId:String(row.id),newValues:{title:row.title},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});return row}
 async update(id:string,input:LetterInput,userId:string,ctx?:Ctx){await this.getForUser(id,userId);const d=this.validate(input);const row=(await this.db.query(`UPDATE letter_documents SET title=$2,reference_number=$3,letter_date=$4,recipient_name=$5,recipient_organization=$6,recipient_address=$7,subject=$8,body=$9,closing=$10,signatory_name=$11,signatory_title=$12,signature_data_url=$13,signature_scale=$14,signature_offset_x=$15,signature_offset_y=$16,approval_status=CASE WHEN approval_status IN('APPROVED','PENDING_APPROVAL') THEN 'DRAFT' ELSE approval_status END,submitted_for_approval_at=CASE WHEN approval_status IN('APPROVED','PENDING_APPROVAL') THEN NULL ELSE submitted_for_approval_at END,approved_at=CASE WHEN approval_status IN('APPROVED','PENDING_APPROVAL') THEN NULL ELSE approved_at END,approved_by_id=CASE WHEN approval_status IN('APPROVED','PENDING_APPROVAL') THEN NULL ELSE approved_by_id END,version_no=CASE WHEN approval_status IN('APPROVED','PENDING_APPROVAL') THEN version_no+1 ELSE version_no END,updated_by_id=$17,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,d.title,d.referenceNumber,d.letterDate,d.recipientName,d.recipientOrganization,d.recipientAddress,d.subject,d.body,d.closing,d.signatoryName,d.signatoryTitle,d.signatureDataUrl,d.signatureScale,d.signatureOffsetX,d.signatureOffsetY,ctx?.actorUserId??null])).rows[0];await this.audit.log({actorUserId:ctx?.actorUserId,action:'LETTER_UPDATED',module:'communications',entityType:'letter_document',entityId:id,newValues:{title:row.title},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});return row}
 async canIssue(userId:string,letter:any){const r=await this.db.query(`SELECT r.code,EXISTS(SELECT 1 FROM letter_approval_exemptions e WHERE (e.subject_type='STAFF' AND e.subject_id=$1) OR (e.subject_type='TEAM' AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.user_id=$1 AND tm.team_id=e.subject_id))) exempt FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,[userId]);return r.rows[0]?.code==='SUPER_ADMIN'||r.rows[0]?.exempt||letter.approval_status==='APPROVED'}
 async submit(id:string,userId:string,ctx?:Ctx){const letter=await this.getForUser(id,userId);if(await this.canIssue(userId,letter)){return (await this.db.query(`UPDATE letter_documents SET approval_status='APPROVED',submitted_for_approval_at=NOW(),approved_at=NOW(),approved_by_id=$2,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,userId])).rows[0]}const row=(await this.db.query(`UPDATE letter_documents SET approval_status='PENDING_APPROVAL',submitted_for_approval_at=NOW(),approval_note=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`,[id])).rows[0];await this.db.query(`INSERT INTO notifications(user_id,title,body,kind,href) SELECT u.id,'Letter awaiting approval',$2,'LETTER_APPROVAL','/letterhead' FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='SUPER_ADMIN' AND u.status='ACTIVE'`,[id,letter.title]);await this.audit.log({actorUserId:userId,action:'LETTER_SUBMITTED_FOR_APPROVAL',module:'communications',entityType:'letter_document',entityId:id,newValues:{status:'PENDING_APPROVAL'},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});return row}
 async review(id:string,userId:string,status:'APPROVED'|'CHANGES_REQUESTED',note?:string|null,ctx?:Ctx){const letter=await this.get(id);if(letter.approval_status!=='PENDING_APPROVAL')throw new BadRequestException('Only letters awaiting approval can be reviewed');const row=(await this.db.query(`UPDATE letter_documents SET approval_status=$2,approval_note=$3,approved_at=CASE WHEN $2='APPROVED' THEN NOW() ELSE NULL END,approved_by_id=CASE WHEN $2='APPROVED' THEN $4::uuid ELSE NULL END,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,status,this.clean(note),userId])).rows[0];if(letter.created_by_id)await this.db.query(`INSERT INTO notifications(user_id,title,body,kind,href) VALUES($1,$2,$3,'LETTER_APPROVAL','/letterhead')`,[letter.created_by_id,status==='APPROVED'?'Letter approved':'Letter changes requested',letter.title]);await this.audit.log({actorUserId:userId,action:status==='APPROVED'?'LETTER_APPROVED':'LETTER_CHANGES_REQUESTED',module:'communications',entityType:'letter_document',entityId:id,newValues:{status,note},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});return row}
 async setExemption(userId:string,subjectType:'STAFF'|'TEAM',subjectId:string,enabled:boolean){if(enabled)await this.db.query(`INSERT INTO letter_approval_exemptions(subject_type,subject_id,created_by_id) VALUES($1,$2,$3) ON CONFLICT(subject_type,subject_id) DO NOTHING`,[subjectType,subjectId,userId]);else await this.db.query(`DELETE FROM letter_approval_exemptions WHERE subject_type=$1 AND subject_id=$2`,[subjectType,subjectId]);return true}
 async exemptions(){return (await this.db.query(`SELECT * FROM letter_approval_exemptions ORDER BY created_at DESC`)).rows}
 async pdf(id:string,userId:string){const [settings,letter]=await Promise.all([this.settings(),this.getForUser(id,userId)]);if(!(await this.canIssue(userId,letter)))throw new BadRequestException('This official letter requires final Admin approval before download');return this.buildPdf(settings,letter)}
 private validate(input:LetterInput){const title=input.title?.trim(),body=input.body?.trim()??'';if(!title)throw new BadRequestException('Letter title is required');const sig=this.clean(input.signatureDataUrl);if(sig&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(sig))throw new BadRequestException('Signature image is invalid');if(sig&&sig.length>2_000_000)throw new BadRequestException('Signature image is too large');const signatureScale=Math.min(1.75,Math.max(.65,Number(input.signatureScale??1)||1)),signatureOffsetX=Math.min(55,Math.max(-55,Math.round(Number(input.signatureOffsetX??0)||0))),signatureOffsetY=Math.min(28,Math.max(-28,Math.round(Number(input.signatureOffsetY??0)||0)));return{title,body,referenceNumber:this.clean(input.referenceNumber),letterDate:input.letterDate||new Date().toISOString().slice(0,10),recipientName:this.clean(input.recipientName),recipientOrganization:this.clean(input.recipientOrganization),recipientAddress:this.clean(input.recipientAddress),subject:this.clean(input.subject),closing:this.clean(input.closing)||'Yours faithfully,',signatoryName:this.clean(input.signatoryName),signatoryTitle:this.clean(input.signatoryTitle),signatureDataUrl:sig,signatureScale,signatureOffsetX,signatureOffsetY}}
 private clean(v:any){const s=String(v??'').trim();return s||null}
 private wrap(text:string,width=88){const lines:string[]=[];for(const paragraph of String(text??'').split(/\r?\n/)){if(!paragraph.trim()){lines.push('');continue}const words=paragraph.trim().split(/\s+/);let line='';for(const word of words){if((line+' '+word).trim().length>width){if(line)lines.push(line);line=word}else line=(line+' '+word).trim()}if(line)lines.push(line)}return lines}
 private esc(s:string){return s.replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
 private buildPdf(settings:any,letter:any){
  const companyLine='Planorahub Integrated Solutions Limited  |  RC 9740831';
  const contactLine='18, Oseni Street, Opposite GT Bank, Anthony, Lagos  |  0803 042 6682  |  Admin@planorahub.app  |  www.Planorahub.app';
  const recipient:string[]=[];
  if(letter.recipient_name)recipient.push(String(letter.recipient_name));
  if(letter.recipient_organization)recipient.push(String(letter.recipient_organization));
  if(letter.recipient_address)recipient.push(...this.wrap(String(letter.recipient_address),72));

  const bodyLines:string[]=[];
  recipient.forEach(x=>bodyLines.push(`__RECIPIENT__${x}`));
  if(recipient.length)bodyLines.push('');
  if(letter.subject)bodyLines.push(`__SUBJECT__${letter.subject}`,'');
  bodyLines.push(...this.wrap(String(letter.body??''),82));

  // Keep the sign-off in its own stationery section near the bottom of the
  // final page, matching the editor instead of letting an empty body pull it
  // up below the date.
  const pages:string[][]=[];let page:string[]=[];let used=0;
  for(const line of bodyLines){
    if(used+1>27){pages.push(page);page=[];used=0}
    page.push(line);used+=1;
  }
  if(page.length||!pages.length)pages.push(page);

  const sigData=String(letter.signature_data_url||'').match(/^data:image\/jpeg;base64,(.+)$/)?.[1];
  const sigHex=sigData?Buffer.from(sigData,'base64').toString('hex').toUpperCase()+'>':null;
  const objects:(string|undefined)[]=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  let next=5;
  const logoHex=Buffer.from(LETTERHEAD_LOGO_JPEG_BASE64,'base64').toString('hex').toUpperCase()+'>';
  const logoObj=next++;objects[logoObj]=`<< /Type /XObject /Subtype /Image /Width ${LETTERHEAD_LOGO_WIDTH} /Height ${LETTERHEAD_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${Buffer.byteLength(logoHex,'ascii')} >>\nstream\n${logoHex}\nendstream`;
  let sigObj:number|undefined;
  if(sigHex){sigObj=next++;objects[sigObj]=`<< /Type /XObject /Subtype /Image /Width 600 /Height 180 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${Buffer.byteLength(sigHex,'ascii')} >>\nstream\n${sigHex}\nendstream`}
  const kids:string[]=[];
  const prettyDate=this.prettyDate(letter.letter_date);
  const ref=letter.reference_number?String(letter.reference_number):'';
  const footer='PlanoraHub official correspondence  |  RC 9740831  |  www.Planorahub.app';

  for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
    const pageObj=next++,contentObj=next++;kids.push(`${pageObj} 0 R`);
    const c:string[]=[];
    c.push('q','1 1 1 rg','0 0 595 842 re f','Q');
    c.push('q','0.36 0.13 0.41 rg','505 842 m 595 842 l 595 790 l 542 790 l h f','Q');
    c.push(`q 126 0 0 78 58 765 cm /Logo Do Q`);
    c.push(`BT /F1 7.6 Tf 0.42 g 198 789 Td (${this.esc('OFFICIAL CORRESPONDENCE')}) Tj ET`);
    c.push('q','0.435 0.173 0.498 RG','1.8 w','58 757 m 537 757 l S','Q');
    c.push(`BT /F1 7.2 Tf 0.34 g 58 744 Td (${this.esc(companyLine)}) Tj ET`);
    c.push(`BT /F1 6.8 Tf 0.42 g 58 733 Td (${this.esc(contactLine)}) Tj ET`);
    c.push(`q 0.965 0.945 0.972 rg BT /F2 57 Tf 0.866 0.5 -0.5 0.866 185 325 Tm (${this.esc('PlanoraHub')}) Tj ET Q`);
    c.push(`BT /F1 10 Tf 0 g 58 704 Td (${this.esc(prettyDate)}) Tj ET`);
    if(ref)c.push(`BT /F1 10 Tf 0 g 410 704 Td (${this.esc(`Ref: ${ref}`)}) Tj ET`);
    if(pageIndex>0)c.push(`BT /F1 8 Tf 0.48 g 58 687 Td (${this.esc(`Continuation - ${letter.title||'Official correspondence'}`)}) Tj ET`);

    let y=pageIndex>0?664:666;
    for(const line of pages[pageIndex]){
      let text=line,font='F1',size=10.5,dy=16,gray='0';
      if(line.startsWith('__RECIPIENT__')){text=line.slice(13);size=10;dy=15}
      else if(line.startsWith('__SUBJECT__')){text=`RE: ${line.slice(11)}`;font='F2';size=10.8;dy=18}
      c.push(`BT /${font} ${size} Tf ${gray} g 58 ${y} Td (${this.esc(text)}) Tj ET`);y-=dy;
    }

    // Signature block belongs to the final-page footer area of the letter,
    // not immediately after whatever body text happens to exist.
    if(pageIndex===pages.length-1){
      let sy=205;
      c.push(`BT /F1 10.5 Tf 0 g 58 ${sy} Td (${this.esc(letter.closing||'Yours faithfully,')}) Tj ET`);sy-=24;
      if(sigObj){const sigScale=Math.min(1.75,Math.max(.65,Number(letter.signature_scale??1)||1)),sigOffsetX=Math.min(55,Math.max(-55,Number(letter.signature_offset_x??0)||0))*.75,sigOffsetY=Math.min(28,Math.max(-28,Number(letter.signature_offset_y??0)||0))*.75;const sigW=125*sigScale,sigH=37.5*sigScale,sigX=58+sigOffsetX,sigY=sy-24-sigOffsetY-(sigH-37.5)/2;c.push(`q ${sigW.toFixed(2)} 0 0 ${sigH.toFixed(2)} ${sigX.toFixed(2)} ${sigY.toFixed(2)} cm /Sig Do Q`);sy-=Math.max(52,Math.round(sigH+14))}
      const signName=letter.signatory_name||settings.signatory_name;
      const signTitle=letter.signatory_title||settings.signatory_title;
      if(signName){c.push(`BT /F2 10.5 Tf 0 g 58 ${sy} Td (${this.esc(String(signName))}) Tj ET`);sy-=15}
      if(signTitle)c.push(`BT /F1 9.5 Tf 0.18 g 58 ${sy} Td (${this.esc(String(signTitle))}) Tj ET`);
    }

    c.push('q','0.435 0.173 0.498 RG','1.6 w','58 61 m 537 61 l S','Q');
    c.push('q','0.435 0.173 0.498 rg','58 32 26 20 re f','Q');
    c.push(`BT /F2 10 Tf 1 1 1 rg 63 39 Td (${this.esc('>>>')}) Tj ET`);
    c.push(`BT /F1 7.1 Tf 0.42 g 92 41 Td (${this.esc(String(footer).slice(0,112))}) Tj ET`);
    c.push(`BT /F1 7 Tf 0.5 g 492 24 Td (${this.esc(`Page ${pageIndex+1} of ${pages.length}`)}) Tj ET`);

    const stream=c.join('\n');objects[contentObj]=`<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream`;
    const xobj=` /XObject << /Logo ${logoObj} 0 R${sigObj?` /Sig ${sigObj} 0 R`:''} >>`;
    objects[pageObj]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> /Contents ${contentObj} 0 R >>`;
  }
  objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf='%PDF-1.4\n';const offsets:number[]=[0];for(let i=1;i<objects.length;i++){if(!objects[i])continue;offsets[i]=Buffer.byteLength(pdf,'latin1');pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}
  const xref=Buffer.byteLength(pdf,'latin1');pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]||0).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf,'latin1')
 }
 private prettyDate(value:string){const raw=String(value??'');let d=new Date(raw);if(Number.isNaN(d.getTime())){const iso=raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];if(iso)d=new Date(`${iso}T12:00:00Z`)}return Number.isNaN(d.getTime())?raw:new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(d)}
}
