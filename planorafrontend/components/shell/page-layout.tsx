import type { ReactNode } from 'react';
export function PageHeader({title,description,breadcrumb,actions}:{title:string;description?:string;breadcrumb?:string;actions?:ReactNode}){return <header className="page-header"><div>{breadcrumb?<div className="breadcrumb">{breadcrumb}</div>:null}<h1>{title}</h1>{description?<p>{description}</p>:null}</div>{actions?<div className="page-header-actions">{actions}</div>:null}</header>}
export function PageSection({children}:{children:ReactNode}){return <section className="page-section">{children}</section>}
export function SectionHeader({title,description,actions}:{title:string;description?:string;actions?:ReactNode}){return <div className="section-header"><div><h2>{title}</h2>{description?<p className="muted">{description}</p>:null}</div>{actions}</div>}
export function ResponsiveGrid({children}:{children:ReactNode}){return <div className="responsive-grid">{children}</div>}
export function Toolbar({children}:{children:ReactNode}){return <div className="toolbar">{children}</div>}
