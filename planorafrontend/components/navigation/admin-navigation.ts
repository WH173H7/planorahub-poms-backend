import type { NavigationSection } from './navigation.types';
export const adminNavigation:NavigationSection[]=[
{label:'Overview',items:[{label:'Dashboard',href:'/dashboard',icon:'dashboard'}]},
{label:'People',items:[{label:'Staff',href:'/staff',icon:'staff'}]},
{label:'CRM',items:[{label:'Leads',href:'/leads',icon:'leads'},{label:'Prospects',href:'/prospects',icon:'prospects'},{label:'Clients',href:'/clients',icon:'clients'}]},
{label:'Work',items:[{label:'Tasks',href:'/tasks',icon:'tasks'},{label:'Follow-ups',href:'/follow-ups',icon:'followups'},{label:'Calendar',href:'/calendar',icon:'calendar'}]},
{label:'Communication',items:[{label:'Email',href:'/email',icon:'email'},{label:'Broadcasts',href:'/broadcasts',icon:'notifications'},{label:'Official Letters',href:'/letterhead',icon:'reports'},{label:'Shared Files',href:'/shared-files',icon:'templates'}]},
{label:'Insights',items:[{label:'Analytics & Reports',href:'/analytics',icon:'analytics'},{label:'Audit Logs',href:'/audit-logs',icon:'audit'}]},
{label:'Administration',items:[{label:'Settings',href:'/settings',icon:'audit'}]}
];
