export type ParsedImportRow = Record<string, string> & { __rowNumber: string };

const expectedHeaders = [
  'organization_name', 'industry', 'website', 'general_email', 'phone',
  'location', 'source', 'priority', 'notes',
];

export async function parseLeadImportFile(file: File): Promise<ParsedImportRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(await file.text());
  if (name.endsWith('.xlsx')) return parseXlsx(await file.arrayBuffer());
  throw new Error('Use a .csv or .xlsx file.');
}

export function downloadLeadImportTemplate() {
  // Keep the column order stable so Admin can fill this file directly and upload it.
  const rows = [
    expectedHeaders,
    ['Acme Limited','Technology','https://acme.example','hello@acme.example','+2348000000000','Lagos, Nigeria','Research','MEDIUM','Potential enterprise account'],
  ];
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'planorahub-lead-import-template.csv';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function normalizeHeader(value: string) {
  const compact = value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const aliases: Record<string,string> = {
    organization:'organization_name', company:'organization_name', company_name:'organization_name', name:'organization_name',
    email:'general_email', organisation_name:'organization_name', organisation:'organization_name',
    website_url:'website', url:'website', telephone:'phone', mobile:'phone',
    address:'location', city:'location', lead_source:'source', remarks:'notes', note:'notes',
  };
  return aliases[compact] ?? compact;
}

function parseCsv(text: string): ParsedImportRow[] {
  const table: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (quoted) {
      if (ch==='"' && text[i+1]==='"') { cell+='"'; i++; }
      else if (ch==='"') quoted=false;
      else cell+=ch;
    } else if (ch==='"') quoted=true;
    else if (ch===',') { row.push(cell); cell=''; }
    else if (ch==='\n') { row.push(cell.replace(/\r$/,'')); table.push(row); row=[]; cell=''; }
    else cell+=ch;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/,'')); table.push(row); }
  return tableToRows(table);
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedImportRow[]> {
  const zip = await readZipEntries(buffer);
  const shared = parseSharedStrings(zip.get('xl/sharedStrings.xml'));
  const sheetPath = resolveFirstSheetPath(zip) ?? 'xl/worksheets/sheet1.xml';
  const xml = zip.get(sheetPath);
  if (!xml) throw new Error('Could not find the first worksheet in this XLSX file.');
  const document = parseXml(xml);
  const rows: string[][] = [];
  for (const rowNode of Array.from(document.getElementsByTagNameNS('*','row'))) {
    const values: string[] = [];
    for (const cellNode of Array.from(rowNode.getElementsByTagNameNS('*','c'))) {
      const ref=cellNode.getAttribute('r') ?? 'A1';
      const column=columnIndex(ref.replace(/[0-9]/g,''));
      const type=cellNode.getAttribute('t');
      let value='';
      if (type==='inlineStr') value=textContent(cellNode,'t');
      else {
        const raw=textContent(cellNode,'v');
        value=type==='s' ? (shared[Number(raw)] ?? '') : raw;
      }
      while (values.length<=column) values.push('');
      values[column]=value;
    }
    rows.push(values);
  }
  return tableToRows(rows);
}

function tableToRows(table: string[][]): ParsedImportRow[] {
  const usable=table.filter((row)=>row.some((cell)=>cell.trim()));
  if (usable.length<2) throw new Error('The import file has headers but no data rows.');
  const headers=usable[0].map(normalizeHeader);
  return usable.slice(1).map((cells,index) => {
    const result: ParsedImportRow = { __rowNumber:String(index+2) };
    headers.forEach((header,column) => { if (header) result[header]=(cells[column] ?? '').trim(); });
    return result;
  }).filter((row)=>Object.entries(row).some(([key,value])=>key!=='__rowNumber' && value));
}

async function readZipEntries(buffer: ArrayBuffer): Promise<Map<string,string>> {
  const view=new DataView(buffer); const bytes=new Uint8Array(buffer); let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
  if(eocd<0) throw new Error('Invalid XLSX archive.');
  const count=view.getUint16(eocd+10,true); let offset=view.getUint32(eocd+16,true); const files=new Map<string,string>();
  for(let n=0;n<count;n++){
    if(view.getUint32(offset,true)!==0x02014b50) break;
    const method=view.getUint16(offset+10,true), compressed=view.getUint32(offset+20,true), nameLen=view.getUint16(offset+28,true), extraLen=view.getUint16(offset+30,true), commentLen=view.getUint16(offset+32,true), local=view.getUint32(offset+42,true);
    const name=new TextDecoder().decode(bytes.slice(offset+46,offset+46+nameLen));
    if(name.endsWith('.xml')||name.endsWith('.rels')){
      const localNameLen=view.getUint16(local+26,true), localExtraLen=view.getUint16(local+28,true), start=local+30+localNameLen+localExtraLen;
      const payload=bytes.slice(start,start+compressed); let plain:Uint8Array;
      if(method===0) plain=payload;
      else if(method===8){
        try {
          const stream=new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          plain=new Uint8Array(await new Response(stream).arrayBuffer());
        } catch { throw new Error('This browser could not decompress the XLSX file. Save it as CSV and retry.'); }
      } else throw new Error('Unsupported XLSX compression method.');
      files.set(name,new TextDecoder().decode(plain));
    }
    offset+=46+nameLen+extraLen+commentLen;
  }
  return files;
}

function resolveFirstSheetPath(files: Map<string,string>) {
  const workbook=files.get('xl/workbook.xml'), rels=files.get('xl/_rels/workbook.xml.rels');
  if(!workbook||!rels) return null;
  const workbookDoc=parseXml(workbook), sheet=workbookDoc.getElementsByTagNameNS('*','sheet')[0];
  const relationshipId=sheet?.getAttribute('r:id') ?? sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  if(!relationshipId) return null;
  const relDoc=parseXml(rels);
  const rel=Array.from(relDoc.getElementsByTagNameNS('*','Relationship')).find((node)=>node.getAttribute('Id')===relationshipId);
  const target=rel?.getAttribute('Target');
  if(!target) return null;
  const cleaned=target.replace(/^\//,'');
  return cleaned.startsWith('xl/') ? cleaned : `xl/${cleaned.replace(/^\.\//,'')}`;
}
function parseSharedStrings(xml?:string){if(!xml)return[];const doc=parseXml(xml);return Array.from(doc.getElementsByTagNameNS('*','si')).map((node)=>Array.from(node.getElementsByTagNameNS('*','t')).map((t)=>t.textContent??'').join(''));}
function parseXml(xml:string){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('Invalid XML inside XLSX file.');return doc;}
function textContent(node:Element,name:string){return node.getElementsByTagNameNS('*',name)[0]?.textContent ?? '';}
function columnIndex(letters:string){let value=0;for(const ch of letters.toUpperCase())value=value*26+(ch.charCodeAt(0)-64);return Math.max(0,value-1);}
function csvCell(value:string){return /[",\n]/.test(value)?`"${value.replace(/"/g,'""')}"`:value;}
