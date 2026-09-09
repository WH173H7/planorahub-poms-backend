import { AppShell } from '@/components/shell/app-shell';
import { TeamActivityDetailView } from '@/components/team-activity/team-activity-detail-view';

export default async function TeamActivityDetailPage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  return (
    <AppShell
      area="admin"
      title="Activity Review"
      breadcrumb="OVERVIEW / TEAM ACTIVITY / REVIEW"
      description="Review meaningful staff work, respond internally and open the related CRM records."
    >
      <TeamActivityDetailView activityId={activityId} />
    </AppShell>
  );
}
