'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {getStaff,listPermissions,listStaff,updateStaff,type Permission,type Staff} from '@/lib/staff/api';
import {listManagedTeams} from '@/lib/workspace/ops-api';
import {getPendingLetterApprovalCount,listLetterApprovalExemptions,setLetterApprovalExemption} from '@/lib/workspace/api';
import {supabase} from '@/lib/supabase/client';

type Section='ACCOUNT'|'ACCESS'|'COMMUNICATION'|'LETTERS'|'FILES'|'NOTIFICATIONS'|'SYSTEM';
const sections:Array<{id:Section;label:string;description:string;icon:string}>=[
  {id:'ACCOUNT',label:'My account',description:'Login and security',icon:'◉'},
  {id:'ACCESS',label:'Staff & access',description:'Roles and individual overrides',icon:'◇'},
  {id:'COMMUNICATION',label:'Communication',description:'Mail, Messenger and broadcasts',icon:'✉'},
  {id:'LETTERS',label:'Official letters',description:'Stationery and approval policy',icon:'▤'},
  {id:'FILES',label:'Shared files',description:'Folder and document access',icon:'▰'},
  {id:'NOTIFICATIONS',label:'Notifications',description:'Operational alerts',icon:'◌'},
  {id:'SYSTEM',label:'System',description:'Audit, insights and integrations',icon:'⚙'},
];

export function SettingsView(){
  const[section,setSection]=useState<Section>('ACCOUNT'),[staff,setStaff]=useState<Staff[]>([]),[teams,setTeams]=useState<any[]>([]),[pendingLetters,setPendingLetters]=useState(0);
  useEffect(()=>{void Promise.all([listStaff(),listManagedTeams(),getPendingLetterApprovalCount().catch(()=>0)]).then(([staffRows,teamRows,count])=>{setStaff(staffRows);setTeams(teamRows);setPendingLetters(count)})},[]);
  const current=sections.find(x=>x.id===section)!;
  return <AppShell area="admin" title="Settings" breadcrumb="Administration" description="Configure access, communication, approvals and the PlanoraHub operating workspace.">
    <div className="settings-pro-shell">
      <aside className="settings-pro-nav"><div className="settings-pro-nav-head"><span className="eyebrow">Settings</span><strong>Workspace control</strong></div>{sections.map(item=><button key={item.id} className={section===item.id?'is-active':''} onClick={()=>setSection(item.id)}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.description}</small></div>{item.id==='LETTERS'&&pendingLetters?<b>{pendingLetters}</b>:null}</button>)}</aside>
      <main className="settings-pro-main"><div className="settings-pro-heading"><span className="settings-pro-icon">{current.icon}</span><div><span className="eyebrow">Administration</span><h2>{current.label}</h2><p>{current.description}</p></div></div>
        {section==='ACCOUNT'?<AccountSettings/>:null}
        {section==='ACCESS'?<AccessSettings staff={staff}/>:null}
        {section==='COMMUNICATION'?<CommunicationSettings/>:null}
        {section==='LETTERS'?<LetterSettings staff={staff} teams={teams} pending={pendingLetters}/>:null}
        {section==='FILES'?<FilesSettings/>:null}
        {section==='NOTIFICATIONS'?<NotificationSettings/>:null}
        {section==='SYSTEM'?<SystemSettings/>:null}
      </main>
    </div>
  </AppShell>;
}

function AccountSettings(){
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{void supabase.auth.getUser().then(result=>setEmail(result.data.user?.email||''))},[]);
  return <div className="settings-pro-stack"><Card><div className="settings-pro-card"><div><span className="eyebrow">Identity</span><h3>Login email</h3><p>Used for authentication and security notices.</p></div><div className="settings-pro-form"><Input label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)}/><Button variant="outline" onClick={async()=>{const r=await supabase.auth.updateUser({email});setMessage(r.error?r.error.message:'Email update requested.')}}>Update email</Button></div></div></Card><Card><div className="settings-pro-card"><div><span className="eyebrow">Security</span><h3>Change password</h3><p>Use a strong password that is unique to PlanoraHub.</p></div><div className="settings-pro-form"><Input label="New password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><Input label="Confirm password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}/><Button disabled={!password||password!==confirm} onClick={async()=>{const r=await supabase.auth.updateUser({password});setMessage(r.error?r.error.message:'Password changed successfully.');if(!r.error){setPassword('');setConfirm('')}}}>Change password</Button></div></div></Card>{message?<div className="settings-message">{message}</div>:null}</div>
}

function AccessSettings({staff}:{staff:Staff[]}){
  const[id,setId]=useState(''),[permissions,setPermissions]=useState<Permission[]>([]),[profile,setProfile]=useState<any>(null),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[search,setSearch]=useState('');
  useEffect(()=>{void listPermissions().then(setPermissions)},[]);useEffect(()=>{if(!id){setProfile(null);return}void getStaff(id).then(setProfile)},[id]);
  const overrides=new Map<string,string>((profile?.permission_overrides||[]).map((item:any)=>[item.permission_id,item.effect]));
  const visible=useMemo(()=>permissions.filter(p=>!search.trim()||`${p.name} ${p.module} ${p.code}`.toLowerCase().includes(search.toLowerCase())),[permissions,search]);
  function change(permissionId:string,effect:string){if(!profile)return;const next=(profile.permission_overrides||[]).filter((item:any)=>item.permission_id!==permissionId);if(effect)next.push({permission_id:permissionId,effect});setProfile({...profile,permission_overrides:next})}
  return <div className="settings-pro-stack"><Card><div className="settings-pro-card"><div><span className="eyebrow">Role model</span><h3>Roles are the default</h3><p>Create reusable roles from Staff & Access. Use this page only for individual exceptions.</p></div><Link href="/staff#roles"><Button variant="outline">Manage roles →</Button></Link></div></Card><Card><div className="settings-pro-section"><div className="settings-pro-section-head"><div><span className="eyebrow">Individual overrides</span><h3>Staff permission exception</h3></div><NativeSelect value={id} onChange={e=>setId(e.target.value)}><option value="">Select staff member</option>{staff.map(member=><option key={member.id} value={member.id}>{member.first_name} {member.last_name} · {member.role_name}</option>)}</NativeSelect></div>{profile?<><Input placeholder="Search permissions…" value={search} onChange={e=>setSearch(e.target.value)}/><div className="settings-access-list">{visible.map(permission=><div key={permission.id}><div><strong>{permission.name}</strong><small>{permission.module} · {permission.code}</small></div><NativeSelect value={overrides.get(permission.id)||''} onChange={e=>change(permission.id,e.target.value)}><option value="">Inherit role</option><option value="ALLOW">Explicit allow</option><option value="DENY">Explicit deny</option></NativeSelect></div>)}</div><div className="settings-pro-actions"><span>{message}</span><Button loading={saving} onClick={async()=>{setSaving(true);try{await updateStaff(id,{permissionOverrides:(profile.permission_overrides||[]).map((item:any)=>({permissionId:item.permission_id,effect:item.effect}))});setMessage('Permissions saved.')}finally{setSaving(false)}}}>Save overrides</Button></div></>:<div className="settings-empty-inline">Choose a staff member to review individual access.</div>}</div></Card></div>
}

function CommunicationSettings(){return <div className="settings-pro-grid"><SettingLink title="PlanoraHub Mail" description="Resend-powered CRM mailbox, drafts and HTML templates." href="/email" action="Open Mail"/><SettingLink title="Messenger" description="Direct, Team, Department and company conversations." href="/internal-chat" action="Open Messenger"/><SettingLink title="Broadcast Center" description="Targeted operational announcements and read tracking." href="/broadcasts" action="Manage broadcasts"/><SettingLink title="Mail templates" description="Manage the branded HTML layouts used by staff email." href="/email" action="Open templates"/></div>}

function LetterSettings({staff,teams,pending}:{staff:Staff[];teams:any[];pending:number}){
  const[rows,setRows]=useState<Array<{subject_type:string;subject_id:string}>>([]);async function load(){setRows(await listLetterApprovalExemptions())}useEffect(()=>{void load()},[]);const exempt=(type:string,id:string)=>rows.some(item=>item.subject_type===type&&item.subject_id===id);
  return <div className="settings-pro-stack"><div className="settings-pro-grid"><SettingLink title="Approval inbox" description={`${pending} letter${pending===1?'':'s'} currently waiting for final review.`} href="/letterhead/approvals" action="Review letters" badge={pending}/><SettingLink title="Approval rules" description="Manage staff, role, department, team and Lead exemptions." href="/letterhead/approval-rules" action="Open rules"/><SettingLink title="Official Letters" description="Draft, sign, approve and download company correspondence." href="/letterhead" action="Open workspace"/></div><Card><div className="settings-pro-section"><div className="settings-pro-section-head"><div><span className="eyebrow">Quick approval exceptions</span><h3>Trusted staff and teams</h3><p>Checked entries can issue letters without final approval. Full rules support Roles, Departments and CRM records.</p></div></div><div className="settings-toggle-list">{staff.filter(member=>member.role_code!=='SUPER_ADMIN').slice(0,12).map(member=><label key={member.id} className="settings-toggle-row"><span><strong>{member.first_name} {member.last_name}</strong><small>{member.department_name||'No department'} · {member.role_name}</small></span><input type="checkbox" checked={exempt('STAFF',member.id)} onChange={async e=>{await setLetterApprovalExemption('STAFF',member.id,e.target.checked);await load()}}/></label>)}{teams.slice(0,8).map(team=><label key={team.id} className="settings-toggle-row"><span><strong>{team.name}</strong><small>Team · {team.member_count||0} members</small></span><input type="checkbox" checked={exempt('TEAM',team.id)} onChange={async e=>{await setLetterApprovalExemption('TEAM',team.id,e.target.checked);await load()}}/></label>)}</div><div className="settings-pro-actions"><span/><Link href="/letterhead/approval-rules"><Button variant="outline">Manage all approval rules →</Button></Link></div></div></Card></div>
}

function FilesSettings(){return <div className="settings-pro-grid"><SettingLink title="Shared Files" description="Manage folders, files and Staff/Department/Team/Role access." href="/shared-files" action="Open file explorer"/><SettingLink title="Access model" description="Folder and file access can inherit or be controlled independently." href="/shared-files" action="Manage access"/></div>}
function NotificationSettings(){return <div className="settings-pro-stack"><Card><div className="settings-pro-card"><div><span className="eyebrow">Operational alerts</span><h3>In-app + email notifications</h3><p>Critical events use the Notification Center and, when configured, Resend email: staff invitations, Lead lifecycle changes, letter approvals and other operational events.</p></div><Link href="/activities"><Button variant="outline">View activity feed</Button></Link></div></Card><Card><div className="settings-pro-section"><div className="settings-status-list"><div><i className="is-on"/><span><strong>In-app notifications</strong><small>Always available for authenticated staff.</small></span></div><div><i className="is-on"/><span><strong>Approval notifications</strong><small>Admin receives pending approvals; authors receive decisions.</small></span></div><div><i/><span><strong>Email delivery</strong><small>Controlled by backend Resend configuration.</small></span></div></div></div></Card></div>}
function SystemSettings(){return <div className="settings-pro-grid"><SettingLink title="Analytics" description="Operational dashboards across CRM, workforce and delivery." href="/analytics" action="Open analytics"/><SettingLink title="Reports" description="Filtered management reports and CSV exports." href="/reports" action="Build report"/><SettingLink title="Audit Logs" description="Immutable administrative and staff action history." href="/audit-logs" action="Open audit logs"/><SettingLink title="Staff structure" description="Roles, Departments, Teams and staff accounts." href="/staff" action="Manage workforce"/></div>}
function SettingLink({title,description,href,action,badge=0}:{title:string;description:string;href:string;action:string;badge?:number}){return <Card><Link className="settings-pro-link" href={href}><div><span className="eyebrow">Configuration</span><h3>{title}{badge?<b>{badge}</b>:null}</h3><p>{description}</p></div><strong>{action} →</strong></Link></Card>}
