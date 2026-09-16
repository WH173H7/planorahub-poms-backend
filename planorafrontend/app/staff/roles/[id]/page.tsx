import { RoleEditorPage } from '@/components/staff/role-editor-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoleEditorPage roleId={id} />;
}
