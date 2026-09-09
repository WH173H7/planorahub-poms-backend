'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {AppShell} from '@/components/shell/app-shell';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Modal} from '@/components/ui/modal';
import {Textarea} from '@/components/ui/textarea';
import {getCurrentCrmUser} from '@/lib/auth/current-user';
import {hasAdministrativeAccess} from '@/lib/auth/routing';
import {getCalendar,type CalendarData} from '@/lib/delivery/api';
import {createReminder,listReminders,createGoogleCalendarEvent} from '@/lib/workspace/ops-api';

type Reminder={id:string;title:string;notes:string|null;starts_at:string;first_name?:string|null;last_name?:string|null;user_id:string};
type Event={id:string;kind:'task'|'followup'|'reminder';title:string;date:string;href?:string;meta:string;owner?:string};
const key=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateKey=(x:string)=>key(new Date(x));
const person=(first?:string|null,last?:string|null)=>[first,last].filter(Boolean).join(' ');

export function CalendarView(){
  const[staff,setStaff]=useState<boolean|null>(null),[d,setD]=useState<CalendarData>({activities:[],tasks:[]}),[reminders,setReminders]=useState<Reminder[]>([]),[cursor,setCursor]=useState(()=>new Date()),[open,setOpen]=useState(false),[error,setError]=useState<string|null>(null);
  async function load(s?:boolean){const isStaff=s??staff??false;const[x,r]=await Promise.all([getCalendar(isStaff),listReminders()]);setD(x);setReminders(r as Reminder[])}
  useEffect(()=>{let active=true;getCurrentCrmUser().then(async u=>{const s=!hasAdministrativeAccess(u);if(active)setStaff(s);const[x,r]=await Promise.all([getCalendar(s),listReminders()]);if(active){setD(x);setReminders(r as Reminder[])}}).catch(x=>active&&setError(x instanceof Error?x.message:'Unable to load calendar.'));return()=>{active=false}},[]);
  const events=useMemo<Event[]>(()=>[
    ...d.tasks.map(x=>{const owner=person(x.assignee_first_name,x.assignee_last_name);return{id:x.id,kind:'task' as const,title:x.title,date:x.due_at,href:`/tasks/${x.id}`,owner,meta:staff?(x.organization_name||'Task deadline'):[owner,x.organization_name||'Task deadline'].filter(Boolean).join(' · ')}}),
    ...d.activities.map(x=>{const owner=person(x.assignee_first_name,x.assignee_last_name);return{id:x.id,kind:'followup' as const,title:x.title,date:x.scheduled_at,owner,meta:staff?(x.organization_name||'Follow-up'):[owner,x.organization_name||'Follow-up'].filter(Boolean).join(' · ')}}),
    ...reminders.map(x=>{const owner=person(x.first_name,x.last_name);return{id:x.id,kind:'reminder' as const,title:x.title,date:x.starts_at,owner,meta:staff?'Personal reminder':`Personal reminder · ${owner||'Unknown staff'}`}})
  ],[d,reminders,staff]);
  const first=new Date(cursor.getFullYear(),cursor.getMonth(),1),start=new Date(cursor.getFullYear(),cursor.getMonth(),1-first.getDay()),days=Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
  const upcoming=events.filter(x=>new Date(x.date)>=new Date()).sort((a,b)=>+new Date(a.date)-+new Date(b.date)).slice(0,12);
  if(staff===null&&!error)return null;
  return <AppShell area={staff?'staff':'admin'} title="Calendar" breadcrumb="Work" description={staff?'Your assigned task deadlines, Lead follow-ups and private reminders.':'Company calendar: all assigned work plus staff-owned reminders, with ownership visible to Admin.'} actions={<Button onClick={()=>setOpen(true)}>+ Reminder</Button>}>
    <div className="calendar-layout"><Card><div className="calendar-toolbar"><button onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}>←</button><div><strong>{cursor.toLocaleString(undefined,{month:'long',year:'numeric'})}</strong><button onClick={()=>setCursor(new Date())}>Today</button></div><button onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}>→</button></div><div className="calendar-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=><span key={x}>{x}</span>)}</div><div className="calendar-month">{days.map(day=>{const ev=events.filter(x=>dateKey(x.date)===key(day));const muted=day.getMonth()!==cursor.getMonth();return <div className={muted?'calendar-day is-muted':'calendar-day'} key={key(day)}><span className={key(day)===key(new Date())?'calendar-number is-today':'calendar-number'}>{day.getDate()}</span><div>{ev.slice(0,3).map(x=>x.href?<Link title={x.meta} href={x.href} className={`calendar-event ${x.kind}`} key={`${x.kind}-${x.id}`}>{x.title}</Link>:<span title={x.meta} className={`calendar-event ${x.kind}`} key={`${x.kind}-${x.id}`}>{x.title}</span>)}{ev.length>3?<small>+{ev.length-3} more</small>:null}</div></div>})}</div></Card><Card><div className="ui-card-content"><span className="eyebrow">Agenda</span><h2>Upcoming</h2>{!staff?<p className="ui-help" style={{marginTop:-4}}>Admin sees company work and each staff member's reminder with ownership clearly labelled.</p>:null}{upcoming.length?upcoming.map(x=><div className="agenda-row" key={`${x.kind}-${x.id}`}><div className={`agenda-dot ${x.kind}`}/><div><strong>{x.title}</strong><span>{new Date(x.date).toLocaleString()} · {x.meta}</span></div>{x.href?<Link href={x.href}>Open →</Link>:null}</div>):<p className="ui-help">No upcoming work.</p>}</div></Card></div>
    {open?<ReminderModal close={()=>setOpen(false)} saved={async()=>{setOpen(false);await load()}}/>:null}{error?<p>{error}</p>:null}
  </AppShell>;
}
function ReminderModal({close,saved}:{close:()=>void;saved:()=>Promise<void>}){const[title,setTitle]=useState(''),[notes,setNotes]=useState(''),[startsAt,setStartsAt]=useState(''),[google,setGoogle]=useState(false);return <Modal open onClose={close} title="New reminder"><form className="stack" onSubmit={async e=>{e.preventDefault();await createReminder({title,notes,startsAt});if(google)await createGoogleCalendarEvent({title,notes,startsAt,reminderMinutes:30});await saved()}}><p className="ui-help" style={{margin:0}}>This reminder belongs to your account. Staff only see their own reminders; Super Admin can see company reminders with the owner identified.</p><Input label="Reminder *" value={title} onChange={e=>setTitle(e.target.value)} required/><Input label="Date & time *" type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)} required/><Textarea label="Notes" value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/><label style={{display:'flex',gap:9,alignItems:'flex-start'}}><input type="checkbox" checked={google} onChange={e=>setGoogle(e.target.checked)}/><span><strong>Add to my Google Calendar</strong><small className="ui-help" style={{display:'block'}}>Uses your connected Google Workspace account so Google can notify your phone. Reconnect Google once to grant Calendar access.</small></span></label><div style={{display:'flex',justifyContent:'flex-end',gap:8}}><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit">Save reminder</Button></div></form></Modal>}
