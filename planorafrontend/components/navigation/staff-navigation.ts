import type { NavigationSection } from './navigation.types';
export const staffNavigation:NavigationSection[]=[
{label:'My Work',items:[{label:'My Day',href:'/home',icon:'dashboard'},{label:'Leads',href:'/my-work',icon:'leads'},{label:'Tasks',href:'/tasks',icon:'tasks'},{label:'Follow-ups',href:'/follow-ups',icon:'followups'},{label:'Calendar',href:'/calendar',icon:'calendar'}]},
{label:'Communication',items:[{label:'Email',href:'/email',icon:'email'},{label:'Official Letters',href:'/letterhead',icon:'letter'},{label:'Shared Files',href:'/shared-files',icon:'file'}]},
{label:'Finance',items:[{label:'Invoices',href:'/invoices',icon:'invoice',permission:'invoices.read'}]}
];
