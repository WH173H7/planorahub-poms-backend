'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import { canUseCompanyActivities } from '@/lib/auth/routing';
import { getCalendar, type CalendarData } from '@/lib/delivery/api';
import { createReminder, listReminders, createGoogleCalendarEvent } from '@/lib/workspace/ops-api';

type Reminder={id:string;title:string;notes:string|null;starts_at:string;first_name?:string|null;last_name?:string|null;user_id:string};
type Event={id:string;kind:'task'|'followup'|'reminder';title:string;date:string;href?:string;meta:string;owner?:string};
type CalendarViewMode='MONTH'|'AGENDA';
const key=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const dateKey=(value:string)=>key(new Date(value));
const person=(first?:string|null,last?:string|null)=>[first,last].filter(Boolean).join(' ');

export function CalendarView(){
  const[staff,setStaff]=useState<boolean|null>(null);
  const[data,setData]=useState<CalendarData>({activities:[],tasks:[]});
  const[reminders,setReminders]=useState<Reminder[]>([]);
  const[cursor,setCursor]=useState(()=>new Date());
  const[open,setOpen]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[view,setView]=useState<CalendarViewMode>('MONTH');

  useEffect(()=>{ if(window.matchMedia('(max-width: 768px)').matches) setView('AGENDA'); },[]);
  async function load(isStaffArg?:boolean){const isStaff=isStaffArg??staff??false;const[calendar,reminderRows]=await Promise.all([getCalendar(isStaff),listReminders()]);setData(calendar);setReminders(reminderRows as Reminder[])}
  useEffect(()=>{let active=true;getCurrentCrmUser().then(async user=>{const isStaff=!canUseCompanyActivities(user);if(active)setStaff(isStaff);const[calendar,reminderRows]=await Promise.all([getCalendar(isStaff),listReminders()]);if(active){setData(calendar);setReminders(reminderRows as Reminder[])}}).catch(caught=>active&&setError(caught instanceof Error?caught.message:'Unable to load calendar.'));return()=>{active=false}},[]);

  const events=useMemo<Event[]>(()=>[
    ...data.tasks.map(item=>{const owner=person(item.assignee_first_name,item.assignee_last_name);return{id:item.id,kind:'task' as const,title:item.title,date:item.due_at,href:`/tasks/${item.id}`,owner,meta:staff?(item.organization_name||'Task deadline'):[owner,item.organization_name||'Task deadline'].filter(Boolean).join(' · ')}}),
    ...data.activities.map(item=>{const owner=person(item.assignee_first_name,item.assignee_last_name);return{id:item.id,kind:'followup' as const,title:item.title,date:item.scheduled_at,owner,meta:staff?(item.organization_name||'Follow-up'):[owner,item.organization_name||'Follow-up'].filter(Boolean).join(' · ')}}),
    ...reminders.map(item=>{const owner=person(item.first_name,item.last_name);return{id:item.id,kind:'reminder' as const,title:item.title,date:item.starts_at,owner,meta:staff?'Personal reminder':`Personal reminder · ${owner||'Unknown staff'}`}})
  ],[data,reminders,staff]);

  const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);
  const start=new Date(cursor.getFullYear(),cursor.getMonth(),1-first.getDay());
  const days=Array.from({length:42},(_,index)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+index));
  const upcoming=events.filter(item=>new Date(item.date)>=new Date()).sort((a,b)=>+new Date(a.date)-+new Date(b.date)).slice(0,30);

  if(staff===null&&!error)return null;

  return <AppShell area={staff?'staff':'admin'} title="Calendar" breadcrumb="Work" description={staff?'Your assigned task deadlines, Lead follow-ups and private reminders.':'Company calendar: all assigned work plus staff-owned reminders, with ownership visible to Admin.'} actions={<Button onClick={()=>setOpen(true)}>+ Reminder</Button>}>
    <div className="calendar-page">
      <div className="calendar-view-switch" role="tablist" aria-label="Calendar view">
        <button aria-selected={view==='MONTH'} onClick={()=>setView('MONTH')}>Month</button>
        <button aria-selected={view==='AGENDA'} onClick={()=>setView('AGENDA')}>Agenda</button>
      </div>
      <div className={`calendar-layout calendar-layout--${view.toLowerCase()}`}>
        {view==='MONTH'?<Card className="calendar-month-card"><div className="calendar-toolbar"><button aria-label="Previous month" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}>←</button><div><strong>{cursor.toLocaleString(undefined,{month:'long',year:'numeric'})}</strong><button onClick={()=>setCursor(new Date())}>Today</button></div><button aria-label="Next month" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}>→</button></div><div className="calendar-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><span key={day}>{day}</span>)}</div><div className="calendar-month">{days.map(day=>{const dayEvents=events.filter(item=>dateKey(item.date)===key(day));const muted=day.getMonth()!==cursor.getMonth();return <div className={muted?'calendar-day is-muted':'calendar-day'} key={key(day)}><span className={key(day)===key(new Date())?'calendar-number is-today':'calendar-number'}>{day.getDate()}</span><div>{dayEvents.slice(0,3).map(item=>item.href?<Link title={item.meta} href={item.href} className={`calendar-event ${item.kind}`} key={`${item.kind}-${item.id}`}>{item.title}</Link>:<span title={item.meta} className={`calendar-event ${item.kind}`} key={`${item.kind}-${item.id}`}>{item.title}</span>)}{dayEvents.length>3?<small>+{dayEvents.length-3} more</small>:null}</div></div>})}</div></Card>:null}
        <Card className="calendar-agenda-card"><div className="ui-card-content"><span className="eyebrow">Agenda</span><h2>Upcoming</h2>{!staff?<p className="ui-help calendar-admin-note">Admin sees company work and each staff member&apos;s reminder with ownership clearly labelled.</p>:null}{upcoming.length?<div className="calendar-agenda-list">{upcoming.map(item=><div className="agenda-row" key={`${item.kind}-${item.id}`}><div className={`agenda-dot ${item.kind}`}/><div><strong>{item.title}</strong><span>{new Date(item.date).toLocaleString()} · {item.meta}</span></div>{item.href?<Link href={item.href}>Open →</Link>:null}</div>)}</div>:<p className="ui-help">No upcoming work.</p>}</div></Card>
      </div>
    </div>
    {open?<ReminderModal close={()=>setOpen(false)} saved={async()=>{setOpen(false);await load()}}/>:null}
    {error?<p className="task-form-error">{error}</p>:null}
  </AppShell>;
}

function ReminderModal({close,saved}:{close:()=>void;saved:()=>Promise<void>}){
  const[title,setTitle]=useState(''),[notes,setNotes]=useState(''),[startsAt,setStartsAt]=useState(''),[google,setGoogle]=useState(false),[saving,setSaving]=useState(false);
  return <Modal open onClose={close} title="New reminder"><form className="stack" onSubmit={async event=>{event.preventDefault();setSaving(true);try{await createReminder({title,notes,startsAt});if(google)await createGoogleCalendarEvent({title,notes,startsAt,reminderMinutes:30});await saved()}finally{setSaving(false)}}}><p className="ui-help calendar-reminder-note">This reminder belongs to your account. Staff only see their own reminders; Super Admin can see company reminders with the owner identified.</p><Input label="Reminder *" value={title} onChange={event=>setTitle(event.target.value)} required/><Input label="Date & time *" type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)} required/><Textarea label="Notes" value={notes} onChange={event=>setNotes(event.target.value)} rows={3}/><label className="calendar-google-check"><input type="checkbox" checked={google} onChange={event=>setGoogle(event.target.checked)}/><span><strong>Add to my Google Calendar</strong><small className="ui-help">Uses your connected Google Workspace account so Google can notify your phone.</small></span></label><div className="polish-actions"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={saving}>Save reminder</Button></div></form></Modal>
}
