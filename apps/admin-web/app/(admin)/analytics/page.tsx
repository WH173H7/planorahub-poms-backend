'use client';

import {
  Activity,
  BriefcaseBusiness,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  RefreshCw,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

type CountItem = {
  count: number;
};

type TaskStatus = CountItem & {
  status: string;
};

type LeadStage = CountItem & {
  stage: string;
  value: string | number;
};

type OrganizationType = CountItem & {
  type: string;
};

type ActivityType = CountItem & {
  type: string;
};

type StaffPerformance = {
  id: string;
  first_name: string;
  last_name: string;
  assigned_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  assigned_activities: number;
  completed_activities: number;
};

type RecentActivity = {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  organization_name: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
};

type Analytics = {
  range: {
    from: string;
    to: string;
  };
  tasks: {
    summary: {
      total_tasks: number;
      active_tasks: number;
      completed_tasks: number;
      overdue_tasks: number;
      completion_rate: string | number | null;
    };
    statuses: TaskStatus[];
  };
  leads: {
    summary: {
      total_leads: number;
      active_leads: number;
      converted_leads: number;
      lost_leads: number;
      pipeline_value: string | number;
      converted_value: string | number;
      conversion_rate: string | number | null;
    };
    stages: LeadStage[];
  };
  organizations: {
    types: OrganizationType[];
  };
  activities: {
    summary: {
      total_activities: number;
      completed_activities: number;
      overdue_activities: number;
      upcoming_activities: number;
      completion_rate: string | number | null;
    };
    types: ActivityType[];
    recent: RecentActivity[];
  };
  staff: {
    performance: StaffPerformance[];
  };
};

type R<T> = {
  success: boolean;
  data: T;
};

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function initialRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    from: dateInputValue(from),
    to: dateInputValue(to),
  };
}

export default function AnalyticsPage() {
  const initial = useMemo(() => initialRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);

      const response = await apiFetch<R<Analytics>>(
        `/admin/analytics/overview?from=${encodeURIComponent(
          new Date(`${from}T00:00:00`).toISOString(),
        )}&to=${encodeURIComponent(end.toISOString())}`,
      );

      setData(response.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load analytics.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const taskSummary = data?.tasks.summary;
  const leadSummary = data?.leads.summary;
  const activitySummary = data?.activities.summary;

  return (
    <div className="mx-auto max-w-[1450px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#765078]">
            OPERATIONS INTELLIGENCE
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#231d24]">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#726874]">
            Live performance across tasks, leads, customers, staff activity and follow-ups.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#e9e2ea] bg-white p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#918693]">
              From
            </span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-lg border border-[#e5dde6] px-3 py-2 text-sm outline-none focus:border-[#765078]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#918693]">
              To
            </span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-lg border border-[#e5dde6] px-3 py-2 text-sm outline-none focus:border-[#765078]"
            />
          </label>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-[#36133b] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Apply
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active tasks"
          value={metric(taskSummary?.active_tasks, loading)}
          detail={`${metric(taskSummary?.completed_tasks, loading)} completed`}
          icon={<ClipboardCheck size={18} />}
        />
        <MetricCard
          label="Overdue work"
          value={metric(taskSummary?.overdue_tasks, loading)}
          detail={`${percent(taskSummary?.completion_rate)} task completion`}
          icon={<Clock3 size={18} />}
          warning
        />
        <MetricCard
          label="Active leads"
          value={metric(leadSummary?.active_leads, loading)}
          detail={`${metric(leadSummary?.converted_leads, loading)} converted`}
          icon={<BriefcaseBusiness size={18} />}
        />
        <MetricCard
          label="Lead conversion"
          value={loading ? '—' : percent(leadSummary?.conversion_rate)}
          detail={`${metric(leadSummary?.total_leads, loading)} total leads`}
          icon={<TrendingUp size={18} />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Task status"
          subtitle="Distribution of work created in the selected period."
        >
          <HorizontalBars
            items={(data?.tasks.statuses ?? []).map((item) => ({
              label: friendly(item.status),
              value: item.count,
            }))}
            loading={loading}
          />
        </ChartCard>

        <ChartCard
          title="Lead pipeline"
          subtitle="Current lead stages for records created in this period."
        >
          <HorizontalBars
            items={(data?.leads.stages ?? []).map((item) => ({
              label: friendly(item.stage),
              value: item.count,
            }))}
            loading={loading}
          />
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <ChartCard
          title="Staff performance"
          subtitle="Assigned and completed operational work."
        >
          <StaffTable
            rows={data?.staff.performance ?? []}
            loading={loading}
          />
        </ChartCard>

        <div className="grid gap-6">
          <ChartCard
            title="Activity mix"
            subtitle="Calls, meetings, email, notes and follow-ups."
          >
            <HorizontalBars
              items={(data?.activities.types ?? []).map((item) => ({
                label: friendly(item.type),
                value: item.count,
              }))}
              loading={loading}
            />
          </ChartCard>

          <ChartCard
            title="Organizations added"
            subtitle="CRM organization types created in this period."
          >
            <HorizontalBars
              items={(data?.organizations.types ?? []).map((item) => ({
                label: friendly(item.type),
                value: item.count,
              }))}
              loading={loading}
            />
          </ChartCard>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
          <h2 className="font-semibold text-[#2d242f]">Activity health</h2>
          <p className="mt-1 text-sm text-[#817681]">
            Follow-up execution for the selected period.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <MiniMetric
              label="Completed"
              value={metric(activitySummary?.completed_activities, loading)}
              icon={<CheckCircle2 size={16} />}
            />
            <MiniMetric
              label="Upcoming"
              value={metric(activitySummary?.upcoming_activities, loading)}
              icon={<CalendarRange size={16} />}
            />
            <MiniMetric
              label="Overdue"
              value={metric(activitySummary?.overdue_activities, loading)}
              icon={<Clock3 size={16} />}
            />
            <MiniMetric
              label="Completion"
              value={loading ? '—' : percent(activitySummary?.completion_rate)}
              icon={<Activity size={16} />}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
          <h2 className="font-semibold text-[#2d242f]">Recent CRM activity</h2>
          <p className="mt-1 text-sm text-[#817681]">
            Latest customer-facing work recorded by the team.
          </p>

          <div className="mt-4 divide-y divide-[#f0eaf1]">
            {loading ? (
              <p className="py-8 text-center text-sm text-[#918693]">
                Loading activity...
              </p>
            ) : (data?.activities.recent ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-[#918693]">
                No activity recorded in this period.
              </p>
            ) : (
              data!.activities.recent.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4eff6] text-[#765078]">
                    <Activity size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-[#403542]">
                        {item.title}
                      </p>
                      <span className="text-[11px] text-[#918693]">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#817681]">
                      {friendly(item.activity_type)}
                      {item.organization_name ? ` · ${item.organization_name}` : ''}
                      {item.assignee_first_name
                        ? ` · ${item.assignee_first_name} ${item.assignee_last_name ?? ''}`.trim()
                        : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e9e2ea] bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[#726874]">{label}</p>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#231d24]">
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          warning ? 'bg-amber-50 text-amber-700' : 'bg-[#f4eff6] text-[#36133b]'
        }`}>
          {icon}
        </div>
      </div>
      <p className="mt-2 text-xs text-[#918693]">{detail}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#e9e2ea] bg-white p-6">
      <h2 className="font-semibold text-[#2d242f]">{title}</h2>
      <p className="mt-1 text-sm text-[#817681]">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function HorizontalBars({
  items,
  loading,
}: {
  items: { label: string; value: number }[];
  loading: boolean;
}) {
  if (loading) {
    return <p className="py-12 text-center text-sm text-[#918693]">Loading analytics...</p>;
  }

  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-[#918693]">No data in this period.</p>;
  }

  const max = Math.max(...items.map((item) => Number(item.value)), 1);

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-[#5e535f]">{item.label}</span>
            <span className="font-semibold text-[#36133b]">{item.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#f2edf3]">
            <div
              className="h-full rounded-full bg-[#765078] transition-all duration-500"
              style={{ width: `${Math.max(4, (Number(item.value) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffTable({
  rows,
  loading,
}: {
  rows: StaffPerformance[];
  loading: boolean;
}) {
  if (loading) {
    return <p className="py-12 text-center text-sm text-[#918693]">Loading staff performance...</p>;
  }

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-[#918693]">No assigned work in this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#eee8ef] text-xs uppercase tracking-wide text-[#918693]">
            <th className="pb-3 font-semibold">Staff</th>
            <th className="pb-3 text-right font-semibold">Tasks</th>
            <th className="pb-3 text-right font-semibold">Completed</th>
            <th className="pb-3 text-right font-semibold">Overdue</th>
            <th className="pb-3 text-right font-semibold">Activities</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0eaf1]">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="py-4 font-semibold text-[#403542]">
                {row.first_name} {row.last_name}
              </td>
              <td className="py-4 text-right">{row.assigned_tasks}</td>
              <td className="py-4 text-right">{row.completed_tasks}</td>
              <td className="py-4 text-right">{row.overdue_tasks}</td>
              <td className="py-4 text-right">
                {row.completed_activities}/{row.assigned_activities}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[#faf7fb] p-4">
      <div className="flex items-center justify-between text-[#765078]">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#918693]">
          {label}
        </span>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function metric(value: number | undefined, loading: boolean) {
  return loading ? '—' : String(value ?? 0);
}

function percent(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  return `${Number.isFinite(numeric) ? numeric : 0}%`;
}

function friendly(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
}
