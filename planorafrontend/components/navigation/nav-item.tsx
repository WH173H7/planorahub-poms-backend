import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import type { NavigationItem as Item } from './navigation.types';
export function NavItem({item,active,collapsed,onNavigate}:{item:Item;active:boolean;collapsed:boolean;onNavigate?:()=>void}){const content=<><span className="nav-icon"><Icon name={item.icon}/></span><span className="nav-label"><span>{item.label}</span>{item.disabled?<span className="coming-soon">Soon</span>:null}</span></>;return <li>{item.href&&!item.disabled?<Tooltip label={item.label} disabled={!collapsed}><Link className="nav-item" data-active={active} href={item.href} aria-current={active?'page':undefined} onClick={onNavigate}>{content}</Link></Tooltip>:<Tooltip label={`${item.label} — coming soon`} disabled={!collapsed}><span className="nav-item" data-disabled="true" aria-disabled="true">{content}</span></Tooltip>}</li>}
