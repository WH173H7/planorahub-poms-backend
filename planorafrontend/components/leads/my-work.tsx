"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageErrorState, PageLoadingState } from "@/components/ui/page-state";
import { getMyWork, listAvailableLeadPool, claimLeadFromPool } from "@/lib/leads/api";
import { getCurrentCrmUser } from "@/lib/auth/current-user";
import { formatDate } from "@/lib/leads/helpers";
import type { MyWork, Lead } from "@/lib/leads/types";
import { LeadPriorityPill, LeadStagePill } from "./lead-status";

export function MyWorkView() {
  const [data, setData] = useState<MyWork | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pool,setPool]=useState<Lead[]>([]); const [tab,setTab]=useState<"ASSIGNED"|"POOL">("ASSIGNED"); const [claiming,setClaiming]=useState<string|null>(null); const [canClaim,setCanClaim]=useState(false);
  useEffect(() => {
    void Promise.all([getMyWork(),getCurrentCrmUser()])
      .then(([work,user])=>{
        setData(work);
        const allowed=user.role_code==='SUPER_ADMIN'||user.permissions.includes('leads.claim');
        setCanClaim(allowed);
        if(allowed) void listAvailableLeadPool().then(setPool).catch(()=>setPool([]));
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load your work.",
        ),
      );
  }, []);
  if (error)
    return (
      <AppShell area="staff" title="My Work" breadcrumb="My Work">
        <PageErrorState message={error} />
      </AppShell>
    );
  if (!data)
    return (
      <AppShell area="staff" title="My Work" breadcrumb="My Work">
        <PageLoadingState />
      </AppShell>
    );
  return (
    <AppShell
      area="staff"
      title="My Work"
      breadcrumb="My Work"
      description="Only work currently assigned to you is shown."
    >
      <div className="metric-grid">
        <MetricCard
          label="Assigned Leads"
          value={String(data.metrics.assigned_leads)}
        />
        <MetricCard
          label="Active pursuits"
          value={String(data.metrics.active_pursuits)}
        />
        <MetricCard label="Tasks today" value={String(data.metrics.tasks_due_today)} />
        <MetricCard label="Overdue Tasks" value={String(data.metrics.overdue_tasks)} />
        <MetricCard label="Follow-ups today" value={String(data.metrics.follow_ups_today)} />
        <MetricCard label="Overdue follow-ups" value={String(data.metrics.overdue_follow_ups)} />
      </div>
      <Card><div className="ui-card-content" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><div><strong>Lead workspace</strong><p className="ui-help">Work assigned to you or pick an available Lead from the shared pool.</p></div><div style={{display:'flex',gap:8}}><Button variant={tab==='ASSIGNED'?'primary':'outline'} onClick={()=>setTab('ASSIGNED')}>My assigned Leads</Button>{canClaim?<Button variant={tab==='POOL'?'primary':'outline'} onClick={()=>setTab('POOL')}>Available Lead Pool ({pool.length})</Button>:null}</div></div></Card>
      {tab==='POOL'?<Card className="workspace-card"><header><div><h2>Available Lead Pool</h2><p>Unassigned opportunities you are permitted to pick up. Claiming a Lead makes you accountable for its pursuit.</p></div></header>{pool.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Organization</th><th>Proposed revenue</th><th>Priority</th><th>Source</th><th></th></tr></thead><tbody>{pool.map(lead=><tr key={lead.id}><td><strong>{lead.organization_name}</strong><small className="ui-help" style={{display:'block'}}>{lead.industry||'Organization Lead'}</small></td><td><strong>{new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(lead.proposed_revenue||0))}</strong><small className="ui-help" style={{display:'block'}}>{lead.revenue_probability}% probability</small></td><td><LeadPriorityPill priority={lead.priority}/></td><td>{lead.source||'—'}</td><td><Button size="sm" loading={claiming===lead.id} onClick={async()=>{setClaiming(lead.id);setError(null);try{await claimLeadFromPool(lead.id);const [mine,available]=await Promise.all([getMyWork(),listAvailableLeadPool()]);setData(mine);setPool(available);setTab('ASSIGNED')}catch(caught){setError(caught instanceof Error?caught.message:'Unable to claim this Lead.')}finally{setClaiming(null)}}}>Pick up Lead</Button></td></tr>)}</tbody></table></div>:<EmptyState icon="leads" title="No available Leads" description="All Lead Pool records are currently assigned or being worked."/>}</Card>:      <Card className="workspace-card">
        <header>
          <div>
            <h2>Assigned Leads</h2>
            <p>Ownership-scoped operational work.</p>
          </div>
        </header>
        {data.leads.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Priority</th>
                  <th>Stage</th>
                  <th>Progress</th>
                  <th>Next follow-up</th>
                  <th>Deadline</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <strong>{lead.organization_name}</strong>
                    </td>
                    <td>
                      <LeadPriorityPill priority={lead.priority} />
                    </td>
                    <td>
                      <LeadStagePill stage={lead.stage} />
                    </td>
                    <td>{lead.pursuit_progress}%</td>
                    <td>
                      {lead.next_follow_up_at
                        ? formatDate(lead.next_follow_up_at)
                        : "—"}
                    </td>
                    <td>
                      {lead.current_assignment_due_at
                        ? formatDate(lead.current_assignment_due_at)
                        : "—"}
                    </td>
                    <td>
                      <Link
                        className="table-link"
                        href={`/my-work/leads/${lead.id}`}
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="leads"
            title="No assigned Leads"
            description="New assignments will appear here after an administrator assigns them to you."
          />
        )}
      </Card>}
    </AppShell>
  );
}
