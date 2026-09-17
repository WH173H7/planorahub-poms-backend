import type { IconName } from '@/components/ui/icon';
export type NavigationItem={
  label:string;
  href?:string;
  icon:IconName;
  disabled?:boolean;
  badge?:number|string;
  permission?:string;
  permissionsAny?:string[];
  permissionsAll?:string[];
  superAdminOnly?:boolean;
};
export type NavigationSection={label:string;items:NavigationItem[]};
