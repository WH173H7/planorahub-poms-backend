import { AppShell } from '@/components/shell/app-shell';
import { PageSection, ResponsiveGrid, SectionHeader } from '@/components/shell/page-layout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';

export default function StaffHomePage() {
  return (
    <AppShell area="staff" title="My Day" breadcrumb="Home" personalize="greeting" description="Here is your work overview.">
      <PageSection>
        <SectionHeader title="My work" description="Your current workload will appear here as features are migrated." />
        <ResponsiveGrid>
          <MetricCard label="Assigned Leads" /><MetricCard label="Follow-ups Today" />
          <MetricCard label="Overdue" /><MetricCard label="Prospect Reviews" />
        </ResponsiveGrid>
      </PageSection>
      <PageSection>
        <SectionHeader title="Today’s work" />
        <Card><EmptyState icon="tasks" title="No assigned work yet" description="Tasks and follow-ups assigned to you will appear here." /></Card>
      </PageSection>
    </AppShell>
  );
}
