import { AppShell } from '@/components/shell/app-shell';
import { PageSection, ResponsiveGrid, SectionHeader } from '@/components/shell/page-layout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';

export default function DashboardPage() {
  return (
    <AppShell area="admin" title="Dashboard" breadcrumb="Overview" personalize="welcome" description="Here is the structure of your PlanoraHub workspace.">
      <PageSection>
        <SectionHeader title="CRM overview" description="Live analytics will be connected in a later milestone." />
        <ResponsiveGrid>
          <MetricCard label="Total Leads" /><MetricCard label="Active Pursuit" />
          <MetricCard label="Prospects" /><MetricCard label="Overdue Work" />
        </ResponsiveGrid>
      </PageSection>
      <PageSection>
        <SectionHeader title="Needs attention" description="Items requiring review will appear here." />
        <Card><EmptyState icon="activity" title="Nothing needs your attention" description="This area will update when CRM workflow data is connected." /></Card>
      </PageSection>
    </AppShell>
  );
}
