'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import {
  auditCompanyReportDownload,
  emailCompanyReport,
  getCompanyReport,
  type CompanyReport,
  type CompanyReportFilters,
} from '@/lib/workspace/api';

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

const human = (value: string) =>
  String(value || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const empty: CompanyReportFilters = { focus: 'overview' };

type EmailResult = {
  tone: 'success' | 'error';
  message: string;
};

export function ReportsView() {
  const [filters, setFilters] = useState<CompanyReportFilters>(empty);
  const [data, setData] = useState<CompanyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [emailPromptOpen, setEmailPromptOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<EmailResult | null>(null);

  const load = useCallback(
    async (next = filters) => {
      setLoading(true);
      setError(null);
      try {
        setData(await getCompanyReport(next));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load report.');
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void load(empty);
    try {
      setSaved(JSON.parse(localStorage.getItem('planorahub.report.presets') || '[]'));
    } catch {
      // Ignore invalid locally stored report presets.
    }
  }, []);

  const activeCount = Object.entries(filters).filter(([key, value]) => key !== 'focus' && Boolean(value)).length;
  const totals = useMemo(
    () => ({
      crm:
        Number(data?.conversion.leads || 0) +
        Number(data?.conversion.prospects || 0) +
        Number(data?.conversion.clients || 0),
      tasks: (data?.tasks || []).reduce((sum, item) => sum + Number(item.count || 0), 0),
    }),
    [data],
  );

  const set = (key: keyof CompanyReportFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value || undefined }));

  const presets = [
    ['Last 30 days', 30],
    ['Last 90 days', 90],
    ['Year to date', 'YTD'],
  ] as const;

  function rangePreset(value: number | 'YTD') {
    const to = new Date();
    const from = value === 'YTD' ? new Date(to.getFullYear(), 0, 1) : new Date(to.getTime() - value * 86400000);
    const next = { ...filters, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    setFilters(next);
    void load(next);
  }

  function savePreset() {
    const name = prompt('Name this report view');
    if (!name?.trim()) return;
    const next = [...new Set([...saved, name.trim()])].slice(-8);
    setSaved(next);
    localStorage.setItem('planorahub.report.presets', JSON.stringify(next));
    localStorage.setItem(`planorahub.report.preset.${name.trim()}`, JSON.stringify(filters));
  }

  function usePreset(name: string) {
    try {
      const next = JSON.parse(localStorage.getItem(`planorahub.report.preset.${name}`) || '{}');
      setFilters(next);
      void load(next);
    } catch {
      // Ignore an invalid local preset rather than interrupting reports.
    }
  }

  function exportReport() {
    if (!data) return;
    downloadCsv(data);
    void auditCompanyReportDownload(filters).catch(() => {
      // Audit telemetry must never block the Admin's local export.
    });
    setEmailResult(null);
    setEmailPromptOpen(true);
  }

  async function sendReportToMyEmail() {
    setEmailSending(true);
    setEmailResult(null);
    try {
      const result = await emailCompanyReport(filters);
      setEmailResult({
        tone: 'success',
        message: `A copy of this report has been sent to ${result.recipient}.`,
      });
    } catch (sendError) {
      setEmailResult({
        tone: 'error',
        message: sendError instanceof Error ? sendError.message : 'Unable to email this report.',
      });
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <AppShell
      area="admin"
      title="Reports"
      breadcrumb="Insights"
      description="Build focused management reports, review the result on-screen, then export the exact filtered view."
      actions={
        <>
          <Button variant="outline" onClick={savePreset}>Save view</Button>
          <Button disabled={!data} onClick={exportReport}>Export CSV</Button>
        </>
      }
    >
      <div className="reports-pro-page">
        <aside className="reports-pro-builder">
          <div className="reports-builder-head">
            <span className="eyebrow">Report builder</span>
            <h2>Define the question</h2>
            <p>Combine scope, dates and people filters. The report preview refreshes only when you apply.</p>
          </div>
          <div className="reports-presets">
            {presets.map(([label, value]) => <button key={label} onClick={() => rangePreset(value)}>{label}</button>)}
          </div>
          <label><span>Report focus</span><select value={filters.focus || 'overview'} onChange={(event) => set('focus', event.target.value)}><option value="overview">Company overview</option><option value="staff">Staff performance</option><option value="leads">CRM lifecycle</option><option value="organizations">Organizations</option><option value="tasks">Tasks & delivery</option><option value="followups">Follow-ups</option><option value="communications">Communications</option></select></label>
          <div className="reports-date-grid"><label><span>From</span><input type="date" value={filters.from || ''} onChange={(event) => set('from', event.target.value)} /></label><label><span>To</span><input type="date" value={filters.to || ''} onChange={(event) => set('to', event.target.value)} /></label></div>
          <label><span>Staff</span><select value={filters.staffId || ''} onChange={(event) => set('staffId', event.target.value)}><option value="">All staff</option>{data?.options.staff.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}</select></label>
          <label><span>Department</span><select value={filters.departmentId || ''} onChange={(event) => set('departmentId', event.target.value)}><option value="">All departments</option>{data?.options.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Organization</span><select value={filters.organizationId || ''} onChange={(event) => set('organizationId', event.target.value)}><option value="">All organizations</option>{data?.options.organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>CRM type</span><select value={filters.recordType || ''} onChange={(event) => set('recordType', event.target.value)}><option value="">All lifecycle records</option><option value="LEAD">Leads</option><option value="PROSPECT">Prospects</option><option value="CLIENT">Clients</option></select></label>
          <label><span>Lead stage</span><select value={filters.leadStage || ''} onChange={(event) => set('leadStage', event.target.value)}><option value="">All stages</option>{data?.options.leadStages.map((item) => <option key={item} value={item}>{human(item)}</option>)}</select></label>
          <label><span>Task status</span><select value={filters.taskStatus || ''} onChange={(event) => set('taskStatus', event.target.value)}><option value="">All task statuses</option>{data?.options.taskStatuses.map((item) => <option key={item} value={item}>{human(item)}</option>)}</select></label>
          <div className="reports-builder-actions"><Button variant="outline" onClick={() => { setFilters(empty); void load(empty); }}>Clear</Button><Button loading={loading} onClick={() => void load(filters)}>Apply {activeCount ? `${activeCount} filters` : ''}</Button></div>
          {saved.length ? <div className="reports-saved"><span>Saved views</span>{saved.map((name) => <button key={name} onClick={() => usePreset(name)}>{name}</button>)}</div> : null}
        </aside>

        <main className="reports-pro-preview">
          {error ? <Card><div className="ui-card-content"><strong>Report could not load</strong><p className="ui-help">{error}</p></div></Card> : null}
          {data ? <>
            <div className="reports-preview-head"><div><span className="eyebrow">Generated report</span><h2>{focusTitle(filters.focus || 'overview')}</h2><p>{data.range.from || data.range.to ? `${data.range.from || 'Start'} → ${data.range.to || 'Today'}` : 'All available dates'} · {activeCount} active filters</p></div><span className="reports-generated">Live data</span></div>
            <div className="reports-kpis"><ReportMetric label="CRM records" value={totals.crm} /><ReportMetric label="Expected revenue" value={money(data.commercial.expected_revenue)} /><ReportMetric label="Realized revenue" value={money(data.commercial.realized_revenue)} /><ReportMetric label="Tasks" value={totals.tasks} /><ReportMetric label="Follow-ups overdue" value={data.followUps.overdue} /></div>
            <div className="reports-section-grid"><Card><ReportPanel title="Lifecycle"><MiniRows rows={data.lifecycle.map((item) => ({ label: human(item.record_type), value: item.count }))} /></ReportPanel></Card><Card><ReportPanel title="Task delivery"><MiniRows rows={data.tasks.map((item) => ({ label: human(item.status), value: item.count }))} /></ReportPanel></Card><Card><ReportPanel title="Communications"><MiniRows rows={[{ label: 'Outbound mail', value: data.communications.outbound_mail }, { label: 'Inbound mail', value: data.communications.inbound_mail }, { label: 'Official letters', value: data.communications.letters }, { label: 'Shared files', value: data.communications.shared_files }]} /></ReportPanel></Card></div>
            <Card><ReportPanel title="Staff delivery"><div className="reports-table"><div className="reports-table-head"><span>Staff</span><span>Department</span><span>Tasks</span><span>Completed</span><span>Overdue</span><span>Active Leads</span></div>{data.staff.map((item) => <div key={item.id} className="reports-table-row"><strong>{item.first_name} {item.last_name}</strong><span>{item.department_name || '—'}</span><span>{item.assigned_tasks}</span><span>{item.completed_tasks}</span><span className={item.overdue_tasks ? 'is-risk' : ''}>{item.overdue_tasks}</span><span>{item.active_leads}</span></div>)}</div></ReportPanel></Card>
            <Card><ReportPanel title="Organizations"><div className="reports-table org"><div className="reports-table-head"><span>Organization</span><span>Industry</span><span>CRM</span><span>Contacts</span><span>Tasks</span><span>Overdue</span></div>{data.organizations.slice(0, 40).map((item) => <div key={item.id} className="reports-table-row"><strong>{item.name}</strong><span>{item.industry || '—'}</span><span>{item.crm_records}</span><span>{item.contacts}</span><span>{item.tasks}</span><span className={item.overdue_tasks ? 'is-risk' : ''}>{item.overdue_tasks}</span></div>)}</div></ReportPanel></Card>
          </> : loading ? <Card><div className="ui-card-content">Generating report…</div></Card> : null}
        </main>
      </div>

      <Modal
        open={emailPromptOpen}
        onClose={() => setEmailPromptOpen(false)}
        title="Send this report to your email?"
        className="reports-email-dialog"
      >
        <div className="reports-email-prompt">
          <span className="reports-email-prompt__icon" aria-hidden="true">✉</span>
          <div>
            <strong>Your CSV has been downloaded.</strong>
            <p>Would you also like PlanoraHub to send the same filtered report to the email address on your Admin account?</p>
          </div>
        </div>

        {emailResult ? <div className={`reports-email-result is-${emailResult.tone}`} role="status">{emailResult.message}</div> : null}

        <div className="reports-email-actions">
          <Button variant="outline" onClick={() => setEmailPromptOpen(false)}>{emailResult?.tone === 'success' ? 'Close' : 'Not now'}</Button>
          {emailResult?.tone !== 'success' ? <Button loading={emailSending} onClick={() => void sendReportToMyEmail()}>Send to my email</Button> : null}
        </div>
      </Modal>
    </AppShell>
  );
}

function focusTitle(value: string) {
  return ({
    overview: 'Company overview',
    staff: 'Staff performance',
    leads: 'CRM lifecycle',
    organizations: 'Organization portfolio',
    tasks: 'Task delivery',
    followups: 'Follow-up operations',
    communications: 'Communications activity',
  } as Record<string, string>)[value] || 'Management report';
}

function ReportMetric({ label, value }: { label: string; value: string | number }) {
  return <Card><div className="reports-metric"><span>{label}</span><strong>{value}</strong></div></Card>;
}

function ReportPanel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="reports-panel"><h3>{title}</h3>{children}</div>;
}

function MiniRows({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return <div className="reports-mini-rows">{rows.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>;
}

function downloadCsv(data: CompanyReport) {
  const rows: string[][] = [
    ['PlanoraHub Management Report'],
    ['From', data.range.from || 'All'],
    ['To', data.range.to || 'All'],
    [],
    ['Commercial'],
    ['Expected revenue', String(data.commercial.expected_revenue)],
    ['Realized revenue', String(data.commercial.realized_revenue)],
    [],
    ['Staff', 'Department', 'Assigned tasks', 'Completed', 'Overdue', 'Active Leads'],
    ...data.staff.map((item) => [
      `${item.first_name} ${item.last_name}`,
      item.department_name || '',
      String(item.assigned_tasks),
      String(item.completed_tasks),
      String(item.overdue_tasks),
      String(item.active_leads),
    ]),
    [],
    ['Organizations', 'Industry', 'CRM records', 'Contacts', 'Tasks', 'Overdue'],
    ...data.organizations.map((item) => [
      item.name,
      item.industry || '',
      String(item.crm_records),
      String(item.contacts),
      String(item.tasks),
      String(item.overdue_tasks),
    ]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'PlanoraHub-management-report.csv';
  link.click();
  URL.revokeObjectURL(url);
}
