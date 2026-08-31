import { LeadWorkspace } from '@/components/leads/lead-workspace';

export default async function LeadDetailPage({params}:{params:Promise<{leadId:string}>}) {
  const {leadId}=await params;
  return <LeadWorkspace leadId={leadId}/>;
}
