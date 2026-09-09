import { StaffLeadWorkspace } from "@/components/leads/staff-lead-workspace";
export default async function StaffLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  return <StaffLeadWorkspace leadId={leadId} />;
}
