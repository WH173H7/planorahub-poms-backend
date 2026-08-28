import type {
  ReactNode,
} from 'react';

import { AdminShell } from '@/components/admin/admin-shell';
import { PageTransition } from '@/components/admin/page-transition';

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AdminShell>
      <PageTransition>
        {children}
      </PageTransition>
    </AdminShell>
  );
}
