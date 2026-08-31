'use client';
import type { ReactNode } from 'react';
export function Drawer({open,onClose,title,children}:{open:boolean;onClose:()=>void;title:string;children:ReactNode}){if(!open)return null;return <><button className="dialog-backdrop" aria-label="Close drawer" onClick={onClose}/><aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children}</aside></>}
