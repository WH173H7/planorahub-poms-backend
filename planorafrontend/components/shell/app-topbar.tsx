'use client';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { GlobalSearch } from '@/components/shell/global-search';
import { supabase } from '@/lib/supabase/client';
import type { CrmUser } from '@/types/auth';
import { NotificationCenter } from '@/components/workspace-ops/notification-center';
export function AppTopbar({user,title,onOpenNavigation}:{user:CrmUser;title:string;onOpenNavigation:()=>void}){const [open,setOpen]=useState(false);const wrap=useRef<HTMLDivElement>(null);useEffect(()=>{const outside=(e:MouseEvent)=>{if(!wrap.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',outside);return()=>document.removeEventListener('mousedown',outside)},[]);async function logout(){await supabase.auth.signOut();window.location.replace('/login')}return <header className="topbar"><div className="topbar-left"><Button variant="ghost" iconOnly className="mobile-trigger" aria-label="Open navigation" onClick={onOpenNavigation}><Icon name="menu"/></Button><div className="topbar-context"><strong>{title}</strong><span>PlanoraHub CRM</span></div></div><div className="topbar-actions"><GlobalSearch/><NotificationCenter/><div ref={wrap} className="user-menu-wrap"><button className="user-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Avatar name={`${user.first_name} ${user.last_name}`}/><span className="user-meta"><strong>{user.first_name} {user.last_name}</strong><span>{user.role_name}</span></span></button>{open?<div className="dropdown-panel" role="menu"><button className="dropdown-item" role="menuitem" onClick={logout}><Icon name="logout"/>Sign out</button></div>:null}</div></div></header>}
