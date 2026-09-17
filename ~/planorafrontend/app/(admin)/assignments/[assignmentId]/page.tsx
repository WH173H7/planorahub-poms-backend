import { AssignmentDetail } from '@/components/leads/assignment-detail';

type Props = {
  params: Promise<{
    assignmentId: string;
  }>;
};

export default async function AssignmentPage({
  params,
}: Props) {
  const { assignmentId } = await params;

  return <AssignmentDetail assignmentId={assignmentId} />;
}
