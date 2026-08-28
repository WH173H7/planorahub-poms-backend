'use client';

import {
  BriefcaseBusiness,
  ClipboardCheck,
  UserCheck,
  Users,
} from 'lucide-react';

import {
  useEffect,
  useState,
} from 'react';

import { apiFetch } from '@/lib/api';

type Staff = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  role_name: string;
};

type StaffResponse = {
  success: boolean;
  data: Staff[];
};

export default function DashboardPage() {
  const [staff, setStaff] =
    useState<Staff[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response =
          await apiFetch<StaffResponse>(
            '/admin/staff',
          );

        setStaff(response.data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Unable to load dashboard.',
        );
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  const activeStaff =
    staff.filter(
      (member) =>
        member.status === 'ACTIVE',
    ).length;

  return (
    <div className="mx-auto max-w-[1450px]">

      <div className="mb-8">
        <p className="text-sm font-medium text-[#7a6f7b]">
          Company overview
        </p>

        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#231d24]">
          Operations dashboard
        </h1>

        <p className="mt-2 text-sm text-[#726874]">
          Monitor your staff, workload,
          leads and operational activity.
        </p>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total staff"
          value={
            loading
              ? '—'
              : String(staff.length)
          }
          icon={Users}
        />

        <Metric
          label="Active staff"
          value={
            loading
              ? '—'
              : String(activeStaff)
          }
          icon={UserCheck}
        />

        <Metric
          label="Active tasks"
          value="—"
          icon={ClipboardCheck}
        />

        <Metric
          label="Active leads"
          value="—"
          icon={BriefcaseBusiness}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">

        <section className="rounded-xl border border-[#e9e2ea] bg-white p-6">
          <div>
            <h2 className="font-semibold">
              Performance overview
            </h2>

            <p className="mt-1 text-sm text-[#726874]">
              Staff performance and workflow
              analytics will appear here.
            </p>
          </div>

          <div className="mt-6 flex min-h-[310px] items-center justify-center rounded-lg bg-[#faf7fb]">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium text-[#5f5560]">
                No operational data yet
              </p>

              <p className="mt-2 text-sm leading-6 text-[#8b818c]">
                Analytics will populate once
                tasks and leads begin being
                processed.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[#e9e2ea] bg-white p-6">
          <h2 className="font-semibold">
            Recent staff
          </h2>

          <p className="mt-1 text-sm text-[#726874]">
            Recently created staff accounts.
          </p>

          <div className="mt-5 divide-y divide-[#eee8ef]">
            {staff
              .slice(0, 5)
              .map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 py-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4eff6] text-xs font-bold text-[#36133b]">
                    {member.first_name[0]}
                    {member.last_name[0]}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {member.first_name}{' '}
                      {member.last_name}
                    </p>

                    <p className="truncate text-xs text-[#817681]">
                      {member.role_name}
                    </p>
                  </div>

                  <span className="rounded-full bg-[#f4eff6] px-2.5 py-1 text-[11px] font-semibold text-[#5b2d61]">
                    {member.status}
                  </span>
                </div>
              ))}

            {!loading &&
            staff.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#8b818c]">
                No staff accounts yet.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-[#e9e2ea] bg-white p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-[#726874]">
          {label}
        </p>

        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4eff6] text-[#36133b]">
          <Icon size={18} />
        </div>
      </div>

      <p className="mt-5 text-3xl font-semibold tracking-tight text-[#231d24]">
        {value}
      </p>
    </div>
  );
}