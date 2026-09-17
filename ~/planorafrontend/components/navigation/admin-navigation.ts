import type { NavigationSection } from './navigation.types';

export const adminNavigation: NavigationSection[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard', icon: 'dashboard', permission: 'analytics.read.all' }] },
  { label: 'People', items: [
    { label: 'Staff', href: '/staff', icon: 'staff', permissionsAll: ['users.read.all', 'users.create'] },
    { label: 'Latest Activities', href: '/activities', icon: 'activity', permission: 'activities.read.all' },
  ] },
  { label: 'CRM', items: [
    { label: 'Leads', href: '/leads', icon: 'leads', permission: 'leads.read.all' },
    { label: 'Lead Pool', href: '/lead-pool', icon: 'targets', permissionsAll: ['leads.read.all', 'leads.assign'] },
    { label: 'Prospects', href: '/prospects', icon: 'prospects', permission: 'leads.read.all' },
    { label: 'Clients', href: '/clients', icon: 'clients', permission: 'leads.read.all' },
  ]},
  { label: 'Work', items: [
    { label: 'Tasks', href: '/tasks', icon: 'tasks', permission: 'tasks.read.all' },
    { label: 'Follow-ups', href: '/follow-ups', icon: 'followups', permission: 'activities.read.all' },
    { label: 'Calendar', href: '/calendar', icon: 'calendar', permission: 'activities.read.all' },
  ]},
  { label: 'Communication', items: [
    { label: 'Email', href: '/email', icon: 'email' },
    { label: 'Broadcasts', href: '/broadcasts', icon: 'notifications', permission: 'broadcasts.manage' },
    { label: 'Official Letters', href: '/letterhead', icon: 'letter', permission: 'letterhead.read' },
    { label: 'Shared Files', href: '/shared-files', icon: 'file', permission: 'shared_files.read' },
  ]},
  { label: 'Finance', items: [{ label: 'Invoices', href: '/invoices', icon: 'invoice', permission: 'invoices.read' }] },
  { label: 'Insights', items: [
    { label: 'Analytics', href: '/analytics', icon: 'analytics', permission: 'analytics.read.all' },
    { label: 'Reports', href: '/reports', icon: 'reports', permission: 'reports.read' },
    { label: 'Audit Logs', href: '/audit-logs', icon: 'audit', permission: 'audit.read.all' },
  ]},
  { label: 'Administration', items: [{ label: 'Settings', href: '/settings', icon: 'settings', superAdminOnly: true }] },
];
