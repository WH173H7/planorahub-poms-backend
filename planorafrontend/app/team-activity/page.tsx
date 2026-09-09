import { AppShell } from '@/components/shell/app-shell';
import { TeamActivityView } from '@/components/team-activity/team-activity-view';

export default function TeamActivityPage() {
  return (
    <AppShell
      area="admin"
      title="Team Activity"
      breadcrumb="OVERVIEW / TEAM ACTIVITY"
      description="Operational visibility into meaningful CRM work across your staff."
    >
      <TeamActivityView />
    </AppShell>
  );
}
