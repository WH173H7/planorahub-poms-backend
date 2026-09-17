import type { NavigationSection } from './navigation.types';
export const staffNavigation:NavigationSection[]=[
{label:'My Work',items:[{label:'My Day',href:'/home',icon:'dashboard'},{label:'Leads',href:'/my-work',icon:'leads'},{label:'Tasks',href:'/tasks',icon:'tasks'},{label:'Follow-ups',href:'/follow-ups',icon:'followups'},{label:'Calendar',href:'/calendar',icon:'calendar'}]},
{label:'Communication',items:[{label:'Email',href:'/email',icon:'email'},{label:'Official Letters',href:'/letterhead',icon:'letter',permission:'letterhead.read'},{label:'Shared Files',href:'/shared-files',icon:'file',permission:'shared_files.read'}]},
{label:'Finance',items:[{label:'Invoices',href:'/invoices',icon:'invoice',permission:'invoices.read'}]},
{label:'Company Access',items:[
  {label:'Company Dashboard',href:'/dashboard',icon:'dashboard',permission:'analytics.read.all'},
  {label:'Staff & Access',href:'/staff',icon:'staff',permissionsAll:['users.read.all','users.create']},
  {label:'Company Leads',href:'/leads',icon:'leads',permission:'leads.read.all'},
  {label:'Latest Activities',href:'/activities',icon:'activity',permission:'activities.read.all'},
  {label:'Reports',href:'/reports',icon:'reports',permission:'reports.read'},
  {label:'Audit Logs',href:'/audit-logs',icon:'audit',permission:'audit.read.all'}
]}
];
