import type { IconName } from '@/components/ui/icon';
export type NavigationItem={label:string;href?:string;icon:IconName;disabled?:boolean;badge?:number|string};
export type NavigationSection={label:string;items:NavigationItem[]};
