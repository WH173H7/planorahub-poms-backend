import type { NavigationSection } from './navigation.types';
export const adminNavigation:NavigationSection[]=[
{label:'Overview',items:[{label:'Dashboard',href:'/dashboard',icon:'dashboard'}]},
{label:'Sales',items:[{label:'Leads',href:'/leads',icon:'leads'},{label:'Prospects',icon:'prospects',disabled:true},{label:'Clients',icon:'clients',disabled:true},{label:'Organizations',icon:'organizations',disabled:true},{label:'Contacts',icon:'contacts',disabled:true}]},
{label:'Work',items:[{label:'Tasks',icon:'tasks',disabled:true},{label:'Follow-ups',icon:'followups',disabled:true},{label:'Calendar',icon:'calendar',disabled:true}]},
{label:'Team',items:[{label:'Staff',icon:'staff',disabled:true}]},{label:'Communication',items:[{label:'Email',icon:'email',disabled:true}]},
{label:'Insights',items:[{label:'Analytics',icon:'analytics',disabled:true},{label:'Reports',icon:'reports',disabled:true},{label:'Audit Logs',icon:'audit',disabled:true}]},
{label:'Administration',items:[{label:'Lead Workflows',icon:'workflow',disabled:true},{label:'Templates',icon:'templates',disabled:true},{label:'Integrations',icon:'integrations',disabled:true},{label:'Settings',icon:'settings',disabled:true}]}];
