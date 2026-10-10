'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentCrmUser } from '@/lib/auth/current-user';
import { canUseCompanyActivities } from '@/lib/auth/routing';
import { getCalendar, type CalendarData } from '@/lib/delivery/api';
import { createGoogleCalendarEvent, createReminder, listReminders } from '@/lib/workspace/ops-api';
import styles from '@/components/staff/followup-calendar.module.css';

type Reminder = { id: string; title: string; notes: string | null; starts_at: string; first_name?: string | null; last_name?: string | null; user_id: string };
type EventKind = 'task' | 'followup' | 'reminder';
type CalendarActivity = CalendarData['activities'][number] & { lead_id?: string | null; completed_at?: string | null };
type CalendarTask = CalendarData['tasks'][number] & { lead_id?: string | null; completed_at?: string | null };
type CalendarEvent = { id: string; kind: EventKind; title: string; date: string; href?: string; meta: string; owner?: string; status?: string; organization?: string | null };
type ViewMode = 'MONTH' | 'AGENDA';
type KindFilter = 'ALL' | EventKind;
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const person = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(' ');
const kindLabels: Record<KindFilter, string> = { ALL: 'Everything', task: 'Tasks', followup: 'Follow-ups', reminder: 'Reminders' };

export function CalendarViewP304() {
  const [staff, setStaff] = useState<boolean | null>(null);
  const [data, setData] = useState<CalendarData>({ activities: [], tasks: [] });
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('MONTH');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState<number>(() => Date.now());

  const load = useCallback(async (isStaff: boolean) => {
    const [calendar, reminderRows] = await Promise.all([getCalendar(isStaff), listReminders()]);
    setData(calendar);
    setReminders(reminderRows as Reminder[]);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    let active = true;
    getCurrentCrmUser().then(async (user) => {
      const isStaff = !canUseCompanyActivities(user);
      if (active) setStaff(isStaff);
      const [calendar, reminderRows] = await Promise.all([getCalendar(isStaff), listReminders()]);
      if (active) { setData(calendar); setReminders(reminderRows as Reminder[]); setNow(Date.now()); setLoading(false); }
    }).catch((caught) => {
      if (active) { setError(caught instanceof Error ? caught.message : 'Unable to load calendar.'); setLoading(false); }
    });
    return () => { active = false; };
  }, []);

  const events = useMemo<CalendarEvent[]>(() => {
    const activities = data.activities as CalendarActivity[];
    const tasks = data.tasks as CalendarTask[];
    return [
      ...tasks.map((item) => {
        const owner = person(item.assignee_first_name, item.assignee_last_name);
        return { id: item.id, kind: 'task' as const, title: item.title, date: item.due_at, href: `/tasks/${item.id}`, owner, status: item.status, organization: item.organization_name, meta: staff ? (item.organization_name || 'Task deadline') : [owner, item.organization_name || 'Task deadline'].filter(Boolean).join(' · ') };
      }),
      ...activities.map((item) => {
        const owner = person(item.assignee_first_name, item.assignee_last_name);
        const href = item.lead_id ? (staff ? `/my-work/leads/${item.lead_id}` : `/leads/${item.lead_id}`) : '/follow-ups';
        return { id: item.id, kind: 'followup' as const, title: item.title, date: item.scheduled_at, href, owner, status: item.status, organization: item.organization_name, meta: staff ? (item.organization_name || 'Follow-up') : [owner, item.organization_name || 'Follow-up'].filter(Boolean).join(' · ') };
      }),
      ...reminders.map((item) => {
        const owner = person(item.first_name, item.last_name);
        return { id: item.id, kind: 'reminder' as const, title: item.title, date: item.starts_at, owner, status: 'PLANNED', meta: staff ? 'Personal reminder' : `Personal reminder · ${owner || 'Unknown staff'}` };
      }),
    ].filter((item) => Boolean(item.date) && !['CANCELLED'].includes(item.status ?? ''));
  }, [data, reminders, staff]);

  const filteredEvents = useMemo(() => events.filter((item) => {
    if (kindFilter !== 'ALL' && item.kind !== kindFilter) return false;
    const haystack = `${item.title} ${item.meta} ${item.organization ?? ''} ${item.owner ?? ''}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [events, kindFilter, query]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const todayKey = dateKey(new Date(now));
  const agendaEvents = useMemo(() => {
    const base = selectedDay ? filteredEvents.filter((item) => dateKey(new Date(item.date)) === selectedDay) : filteredEvents.filter((item) => new Date(item.date).getTime() >= now);
    return base.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, selectedDay ? 100 : 40);
  }, [filteredEvents, selectedDay, now]);

  if (error) return <AppShell area={staff ? 'staff' : 'admin'} title="Calendar" breadcrumb="Work"><Card><div className="ui-card-content"><p role="alert">{error}</p><Button variant="outline" onClick={() => { setError(null); setLoading(true); void getCurrentCrmUser().then(async (user) => { const isStaff = !canUseCompanyActivities(user); setStaff(isStaff); await load(isStaff); }).then(() => setLoading(false)).catch((caught) => { setError(caught instanceof Error ? caught.message : 'Unable to load calendar.'); setLoading(false); }); }}>Try again</Button></div></Card></AppShell>;
  if (loading || staff === null) return <AppShell area="auto" title="Calendar" breadcrumb="Work"><Skeleton height={520} /></AppShell>;

  return <AppShell area={staff ? 'staff' : 'admin'} title="Calendar" breadcrumb="Work" description={staff ? 'Your assigned deadlines, Lead follow-ups and private reminders.' : 'Company work and staff reminders, with ownership clearly labelled.'} actions={<Button onClick={() => setOpen(true)}>+ Reminder</Button>}>
    <div className={`page-stack ${styles.calendarPage}`}>
      <Card className={styles.calendarControlCard}>
        <div className={styles.calendarControlTop}>
          <div><span className="eyebrow">Schedule workspace</span><h2>{selectedDay ? new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${selectedDay}T12:00:00`)) : 'Your schedule'}</h2><p>{selectedDay ? `${agendaEvents.length} item${agendaEvents.length === 1 ? '' : 's'} on this date` : `${filteredEvents.length} scheduled items match your filters`}</p></div>
          <div className={styles.calendarViewSwitch} role="tablist" aria-label="Calendar view"><button type="button" role="tab" aria-selected={view === 'MONTH'} className={view === 'MONTH' ? styles.activeView : ''} onClick={() => setView('MONTH')}>Month</button><button type="button" role="tab" aria-selected={view === 'AGENDA'} className={view === 'AGENDA' ? styles.activeView : ''} onClick={() => setView('AGENDA')}>Agenda</button></div>
        </div>
        <div className={styles.calendarFilters}>
          <div className={styles.calendarKindFilters}>{(['ALL', 'task', 'followup', 'reminder'] as KindFilter[]).map((kind) => <button type="button" key={kind} aria-pressed={kindFilter === kind} className={kindFilter === kind ? styles.activeFilter : ''} onClick={() => setKindFilter(kind)}>{kindLabels[kind]}</button>)}</div>
          <div className={styles.calendarSearch}><Input aria-label="Search calendar" placeholder="Search title, organisation or owner…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        </div>
      </Card>

      <div className={`${styles.calendarLayout} ${view === 'AGENDA' ? styles.agendaOnly : ''}`}>
        {view === 'MONTH' ? <Card className={`calendar-month-card ${styles.calendarMonthCard}`}>
          <div className="calendar-toolbar"><button type="button" aria-label="Previous month" onClick={() => { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)); setSelectedDay(null); }}>←</button><div><strong>{cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong><button type="button" onClick={() => { setCursor(new Date()); setSelectedDay(todayKey); }}>Today</button></div><button type="button" aria-label="Next month" onClick={() => { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)); setSelectedDay(null); }}>→</button></div>
          <div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-month">{days.map((day) => {
            const key = dateKey(day);
            const dayEvents = filteredEvents.filter((item) => dateKey(new Date(item.date)) === key);
            const muted = day.getMonth() !== cursor.getMonth();
            return <div className={`calendar-day${muted ? ' is-muted' : ''}${selectedDay === key ? ` ${styles.selectedDay}` : ''}`} key={key}>
              <button type="button" className={styles.daySelect} aria-label={`Show events for ${day.toDateString()}`} aria-pressed={selectedDay === key} onClick={() => { setSelectedDay(key); setView('AGENDA'); }}><span className={key === todayKey ? 'calendar-number is-today' : 'calendar-number'}>{day.getDate()}</span></button>
              <div>{dayEvents.slice(0, 3).map((item) => item.href ? <Link title={item.meta} href={item.href} className={`calendar-event ${item.kind}`} key={`${item.kind}-${item.id}`}>{item.title}</Link> : <span title={item.meta} className={`calendar-event ${item.kind}`} key={`${item.kind}-${item.id}`}>{item.title}</span>)}{dayEvents.length > 3 ? <small>+{dayEvents.length - 3} more</small> : null}</div>
            </div>;
          })}</div>
          <div className={styles.calendarLegend}><span><i className={styles.legendTask}/>Tasks</span><span><i className={styles.legendFollowup}/>Follow-ups</span><span><i className={styles.legendReminder}/>Reminders</span></div>
        </Card> : null}

        <Card className={styles.calendarAgendaCard}>
          <div className="ui-card-content">
            <div className={styles.agendaHeading}><div><span className="eyebrow">{selectedDay ? 'Selected date' : 'Next on your schedule'}</span><h2>{selectedDay ? 'Day agenda' : 'Upcoming'}</h2></div>{selectedDay ? <Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)}>Show upcoming</Button> : null}</div>
            {!staff ? <p className="ui-help">Admin view includes the owner of each assigned item and personal reminder.</p> : null}
            {agendaEvents.length ? <div className={styles.calendarAgendaList}>{agendaEvents.map((item) => <article className={styles.calendarAgendaRow} key={`${item.kind}-${item.id}`}>
              <div className={`${styles.agendaDot} ${styles[`dot_${item.kind}`]}`}/>
              <div className={styles.agendaEventMain}><div className={styles.agendaEventTitle}><strong>{item.title}</strong><Badge tone={item.kind === 'task' ? 'info' : item.kind === 'followup' ? 'warning' : 'neutral'}>{kindLabels[item.kind]}</Badge></div><span>{new Date(item.date).toLocaleString()} · {item.meta}</span>{item.status && ['COMPLETED', 'IN_PROGRESS'].includes(item.status) ? <small>{item.status.replaceAll('_', ' ')}</small> : null}</div>
              {item.href ? <Link className={styles.agendaOpen} href={item.href}>Open ↗</Link> : null}
            </article>)}</div> : <div className={styles.calendarEmpty}><strong>No scheduled items</strong><p>{selectedDay ? 'Nothing matches this date and the selected filters.' : 'Your upcoming schedule is clear. Add a reminder if there is something you need to remember.'}</p>{selectedDay ? <Button variant="outline" size="sm" onClick={() => setSelectedDay(null)}>Back to upcoming</Button> : <Button size="sm" onClick={() => setOpen(true)}>+ Add reminder</Button>}</div>}
          </div>
        </Card>
      </div>
    </div>
    {open ? <ReminderModal close={() => setOpen(false)} saved={async () => { setOpen(false); setLoading(true); try { await load(staff); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to refresh calendar.'); } finally { setLoading(false); } }} /> : null}
  </AppShell>;
}

function ReminderModal({ close, saved }: { close: () => void; saved: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [google, setGoogle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimumDateTime] = useState(() => toLocalInput(new Date().toISOString()));
  return <Modal open onClose={close} title="New reminder"><form className={`stack ${styles.reminderForm}`} onSubmit={async (event) => {
    event.preventDefault(); setSaving(true); setError(null);
    try { await createReminder({ title: title.trim(), notes: notes.trim() || null, startsAt: new Date(startsAt).toISOString() }); if (google) await createGoogleCalendarEvent({ title: title.trim(), notes: notes.trim() || null, startsAt: new Date(startsAt).toISOString(), reminderMinutes: 30 }); await saved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save this reminder.'); }
    finally { setSaving(false); }
  }}>
    <p className={styles.reminderNote}>This reminder belongs to your account. Staff see their own reminders; Admin can see company reminders with the owner identified.</p>
    {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
    <Input label="Reminder title *" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180}/>
    <Input label="Date & time *" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required min={minimumDateTime}/>
    <Textarea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3}/>
    <label className={styles.googleCheck}><input type="checkbox" checked={google} onChange={(event) => setGoogle(event.target.checked)}/><span><strong>Add to my Google Calendar</strong><small>Uses your connected Google Workspace account so Google can notify your phone.</small></span></label>
    <div className={styles.modalActions}><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Save reminder</Button></div>
  </form></Modal>;
}

function toLocalInput(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); }
