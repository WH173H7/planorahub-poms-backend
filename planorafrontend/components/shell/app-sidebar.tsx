'use client';

import Image from 'next/image';
import {useEffect,useMemo,useState} from 'react';
import {NavSection} from '@/components/navigation/nav-section';
import type {NavigationSection} from '@/components/navigation/navigation.types';
import {Icon} from '@/components/ui/icon';
import {getPendingLetterApprovalCount,listChatChannels} from '@/lib/workspace/api';
import {directContacts} from '@/lib/workspace/ops-api';

type AppSidebarProps={navigation:NavigationSection[];path:string;collapsed:boolean;onNavigate?:()=>void;onToggleCollapsed?:()=>void;mobile?:boolean};

export function AppSidebar({navigation,path,collapsed,onNavigate,onToggleCollapsed,mobile=false}:AppSidebarProps){
  const compact=collapsed&&!mobile;
  const[pendingLetters,setPendingLetters]=useState(0),[unreadMessenger,setUnreadMessenger]=useState(0);

  useEffect(()=>{
    if(!navigation.some(section=>section.items.some(item=>item.href==='/reports')))return;
    let alive=true;
    const load=async()=>{try{const count=await getPendingLetterApprovalCount();if(alive)setPendingLetters(count)}catch{if(alive)setPendingLetters(0)}};
    void load();const timer=setInterval(()=>void load(),15000);return()=>{alive=false;clearInterval(timer)};
  },[navigation]);

  useEffect(()=>{
    if(!navigation.some(section=>section.items.some(item=>item.href==='/internal-chat')))return;
    let alive=true;
    const load=async()=>{try{const[channels,people]=await Promise.all([listChatChannels(),directContacts()]);const count=channels.reduce((sum,item)=>sum+Number(item.unread_count||0),0)+people.reduce((sum,item)=>sum+Number(item.unread_count||0),0);if(alive)setUnreadMessenger(count)}catch{if(alive)setUnreadMessenger(0)}};
    void load();const timer=setInterval(()=>void load(),10000);return()=>{alive=false;clearInterval(timer)};
  },[navigation]);

  const decorated=useMemo(()=>navigation.map(section=>({...section,items:section.items.map(item=>{
    if(item.href==='/letterhead'&&pendingLetters)return{...item,badge:pendingLetters};
    if(item.href==='/internal-chat'&&unreadMessenger)return{...item,badge:unreadMessenger>99?'99+':unreadMessenger};
    return item;
  })})),[navigation,pendingLetters,unreadMessenger]);

  return <aside className="sidebar" aria-label="Application navigation">
    <div className="sidebar-brand">
      {compact?<span className="brand-mark" aria-label="PlanoraHub">P</span>:<div className="sidebar-brand-logo" aria-label="PlanoraHub CRM"><Image src="/planorahub.png" alt="PlanoraHub CRM" width={104} height={59} priority/></div>}
      {mobile?<button className="mobile-close" type="button" aria-label="Close navigation" onClick={onNavigate}><Icon name="close"/></button>:null}
    </div>
    <nav className="sidebar-nav">{decorated.map(section=><NavSection key={section.label} section={section} path={path} collapsed={collapsed} onNavigate={onNavigate}/>)}</nav>
    {!mobile&&onToggleCollapsed?<div className="sidebar-footer"><button className="collapse-button" type="button" onClick={onToggleCollapsed} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'}><Icon name="chevron"/><span className="collapse-label">{collapsed?'':'Collapse'}</span></button></div>:null}
  </aside>;
}
