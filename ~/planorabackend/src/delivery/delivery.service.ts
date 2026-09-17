import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StaffMailService } from '../mailer/staff-mail.service.js';

type Ctx={actorUserId?:string;ipAddress?:string;userAgent?:string};
@Injectable()
export class DeliveryService {
  constructor(private readonly db:DatabaseService,private readonly audit:AuditService,private readonly mail:StaffMailService){}

  async dashboard(){
    const [kpi,stages,staff,recent,upcoming]=await Promise.all([
      this.db.query(`SELECT
        (SELECT COUNT(*)::int FROM leads WHERE record_type='LEAD') total_leads,
        (SELECT COUNT(*)::int FROM leads WHERE record_type='LEAD' AND stage NOT IN ('NEW','DISQUALIFIED','READY_FOR_PROSPECT_REVIEW')) active_pursuits,
        (SELECT COUNT(*)::int FROM leads WHERE record_type='PROSPECT') prospects,
        (SELECT COUNT(*)::int FROM leads WHERE record_type='CLIENT') clients,
        (SELECT COUNT(*)::int FROM tasks WHERE status NOT IN ('COMPLETED','CANCELLED') AND due_at<NOW()) overdue_tasks,
        (SELECT COUNT(*)::int FROM activities WHERE status='PLANNED' AND scheduled_at::date=CURRENT_DATE) followups_today,
        (SELECT COUNT(*)::int FROM leads WHERE record_type='LEAD' AND stage='READY_FOR_PROSPECT_REVIEW') ready_for_review`),
      this.db.query(`SELECT stage::text stage,COUNT(*)::int count FROM leads WHERE record_type='LEAD' GROUP BY stage ORDER BY count DESC`),
      this.db.query(`SELECT u.id,u.first_name,u.last_name,
        COUNT(DISTINCT t.id)::int assigned_tasks,
        COUNT(DISTINCT t.id) FILTER(WHERE t.status='COMPLETED')::int completed_tasks,
        COUNT(DISTINCT t.id) FILTER(WHERE t.status NOT IN('COMPLETED','CANCELLED') AND t.due_at<NOW())::int overdue_tasks,
        COUNT(DISTINCT l.id) FILTER(WHERE l.record_type='LEAD')::int assigned_leads
        FROM users u LEFT JOIN tasks t ON t.assigned_to_id=u.id LEFT JOIN leads l ON l.assigned_to_id=u.id
        WHERE u.status='ACTIVE' GROUP BY u.id ORDER BY completed_tasks DESC,overdue_tasks ASC LIMIT 8`),
      this.db.query(`SELECT al.id,al.action,al.module,al.entity_type,al.entity_id,al.created_at,u.first_name,u.last_name FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_user_id ORDER BY al.created_at DESC LIMIT 8`),
      this.db.query(`SELECT a.id,a.title,a.activity_type,a.scheduled_at,a.lead_id,a.organization_id,o.name organization_name,u.first_name assignee_first_name,u.last_name assignee_last_name
        FROM activities a LEFT JOIN organizations o ON o.id=a.organization_id LEFT JOIN users u ON u.id=a.assigned_to_id
        WHERE a.status='PLANNED' AND a.scheduled_at>=NOW() ORDER BY a.scheduled_at LIMIT 8`)
    ]);
    return {kpi:kpi.rows[0],stages:stages.rows,staff:staff.rows,recent:recent.rows,upcoming:upcoming.rows};
  }

  async lifecycle(type:'PROSPECT'|'CLIENT'){
    const r=await this.db.query(`SELECT l.*,o.name organization_name,o.industry,o.email organization_email,o.phone organization_phone,
      u.first_name owner_first_name,u.last_name owner_last_name,
      (SELECT COUNT(*)::int FROM contacts c WHERE c.organization_id=o.id) contact_count,
      (SELECT COUNT(*)::int FROM tasks t WHERE t.organization_id=o.id AND t.status NOT IN('COMPLETED','CANCELLED')) open_tasks
      FROM leads l JOIN organizations o ON o.id=l.organization_id LEFT JOIN users u ON u.id=l.assigned_to_id
      WHERE l.record_type=$1::lead_record_type ORDER BY COALESCE(l.converted_to_client_at,l.converted_to_prospect_at,l.updated_at) DESC`,[type]);
    return r.rows;
  }

  async approveProspect(id:string,ctx?:Ctx){
    const current=await this.lifecycleRecord(id,'LEAD');
    if(!current)throw new NotFoundException('Lead not found');
    if(current.stage!=='READY_FOR_PROSPECT_REVIEW')throw new BadRequestException('Lead must be ready for Prospect review first');
    if(!Number(current.expected_revenue)||Number(current.expected_revenue)<=0)throw new BadRequestException('Expected revenue is required before Prospect approval');
    const r=await this.db.query(`UPDATE leads SET record_type='PROSPECT',stage='QUALIFIED',available_in_pool=false,converted_to_prospect_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`,[id]);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'LEAD_CONVERTED_TO_PROSPECT',module:'leads',entityType:'lead',entityId:id,oldValues:current,newValues:r.rows[0],ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    const adminIds=await this.adminIds();
    const participants=await this.participantIds(current);
    const conversionMessage=`${current.organization_name} is now a Prospect. Expected revenue: ${this.money(Number(current.expected_revenue))}.`;
    await this.notifyUsers(adminIds,{title:'Lead converted to Prospect',body:conversionMessage,kind:'PROSPECT_CONVERSION',href:'/prospects',subject:`Prospect created: ${current.organization_name}`});
    await this.notifyUsers(participants,{title:'Your Lead is now a Prospect',body:conversionMessage,kind:'PROSPECT_CONVERSION',href:'/home',subject:`Prospect approved: ${current.organization_name}`});
    return r.rows[0];
  }

  async rejectProspect(id:string,reason:string|undefined,ctx?:Ctx){
    const current=await this.lifecycleRecord(id,'LEAD');
    if(!current)throw new NotFoundException('Lead not found');
    const note=reason?.trim();
    const r=await this.db.query(`UPDATE leads SET stage='ENGAGED',notes=CASE WHEN $2::text IS NULL THEN notes ELSE CONCAT_WS(E'\n',notes,'Prospect review: '||$2) END,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,note||null]);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'PROSPECT_REVIEW_REJECTED',module:'leads',entityType:'lead',entityId:id,oldValues:current,newValues:r.rows[0],ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    const participants=await this.participantIds(current);
    if(participants.length) await this.notifyUsers(participants,{title:'Prospect review returned',body:`${current.organization_name} was returned for more Lead work${note?`: ${note}`:'.'}`,kind:'PROSPECT_REVIEW',href:`/my-work/leads/${id}`,subject:`More work requested: ${current.organization_name}`});
    return r.rows[0];
  }

  async convertClient(id:string,ctx?:Ctx){
    const current=await this.lifecycleRecord(id,'PROSPECT');
    if(!current)throw new NotFoundException('Prospect not found');
    const r=await this.db.query(`UPDATE leads SET record_type='CLIENT',converted_to_client_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`,[id]);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'PROSPECT_CONVERTED_TO_CLIENT',module:'leads',entityType:'lead',entityId:id,oldValues:current,newValues:r.rows[0],ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    const clientMessage=`${current.organization_name} is now a Client. Realized revenue will be recorded after payment is confirmed.`;
    await this.notifyUsers(await this.adminIds(),{title:'Prospect converted to Client',body:clientMessage,kind:'CLIENT_CONVERSION',href:'/clients',subject:`New Client: ${current.organization_name}`});
    await this.notifyUsers(await this.participantIds(current),{title:'Your Prospect is now a Client',body:clientMessage,kind:'CLIENT_CONVERSION',href:'/home',subject:`Client conversion: ${current.organization_name}`});
    return r.rows[0];
  }

  async recordClientRevenue(id:string,amountInput:number,ctx?:Ctx){
    const amount=Number(amountInput);
    if(!Number.isFinite(amount)||amount<=0)throw new BadRequestException('Enter a realized revenue amount greater than zero');
    const current=await this.lifecycleRecord(id,'CLIENT');
    if(!current)throw new NotFoundException('Client not found');
    const updated=(await this.db.query(`UPDATE leads SET actual_revenue=$2,client_revenue_recorded_at=NOW(),client_revenue_recorded_by_id=$3,updated_at=NOW() WHERE id=$1 AND record_type='CLIENT' RETURNING *`,[id,amount,ctx?.actorUserId??null])).rows[0];
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'CLIENT_REVENUE_RECORDED',module:'clients',entityType:'lead',entityId:id,oldValues:{actualRevenue:current.actual_revenue},newValues:{actualRevenue:amount},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    const ownerName=[current.owner_first_name,current.owner_last_name].filter(Boolean).join(' ')||current.assigned_team_name||'The PlanoraHub team';
    const body=`${ownerName} brought ${current.organization_name} on board, with ${this.money(amount)} in realized revenue recorded.`;
    await this.notifyUsers(await this.activeUserIds(),{title:'New client revenue recorded',body,kind:'CLIENT_REVENUE',href:'/clients',subject:`${current.organization_name}: ${this.money(amount)} revenue recorded`});
    return updated;
  }

  private async lifecycleRecord(id:string,type:'LEAD'|'PROSPECT'|'CLIENT'){
    return (await this.db.query(`SELECT l.*,o.name organization_name,u.first_name owner_first_name,u.last_name owner_last_name,t.name assigned_team_name FROM leads l JOIN organizations o ON o.id=l.organization_id LEFT JOIN users u ON u.id=l.assigned_to_id LEFT JOIN teams t ON t.id=l.assigned_team_id WHERE l.id=$1 AND l.record_type=$2::lead_record_type LIMIT 1`,[id,type])).rows[0]??null;
  }

  private async adminIds(){return (await this.db.query(`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='SUPER_ADMIN' AND u.status='ACTIVE'`)).rows.map((row:any)=>String(row.id));}
  private async activeUserIds(){return (await this.db.query(`SELECT id FROM users WHERE status='ACTIVE'`)).rows.map((row:any)=>String(row.id));}
  private async teamMemberIds(teamId:string){return (await this.db.query(`SELECT user_id id FROM team_members WHERE team_id=$1`,[teamId])).rows.map((row:any)=>String(row.id));}
  private async participantIds(record:any){const ids:string[]=[];if(record?.assigned_to_id)ids.push(String(record.assigned_to_id));if(record?.assigned_team_id)ids.push(...await this.teamMemberIds(String(record.assigned_team_id)));return[...new Set(ids)];}
  private async notifyUsers(ids:string[],payload:{title:string;body:string;kind:string;href:string;subject:string}){
    const unique=[...new Set(ids.filter(Boolean))];
    if(!unique.length)return;
    const recipients=(await this.db.query(`SELECT id,first_name,email FROM users WHERE id=ANY($1::uuid[]) AND status<>'DISABLED'`,[unique])).rows;
    for(const recipient of recipients){
      await this.db.query(`INSERT INTO notifications(user_id,title,body,kind,href) VALUES($1,$2,$3,$4,$5)`,[recipient.id,payload.title,payload.body,payload.kind,payload.href]);
      if(recipient.email){
        await this.mail.sendOperational({to:recipient.email,firstName:recipient.first_name,subject:payload.subject,title:payload.title,message:payload.body,ctaPath:payload.href,ctaLabel:'Open in PlanoraHub CRM',idempotencyKey:`${payload.kind}/${recipient.id}/${Date.now()}`});
      }
    }
  }
  private money(value:number){return new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(value);}

  async calendar(userId?:string,staff=false){
    const [activities,tasks]=await Promise.all([
      this.db.query(`SELECT a.id,a.title,a.activity_type,a.status,a.scheduled_at,a.completed_at,a.organization_id,a.lead_id,o.name organization_name,u.first_name assignee_first_name,u.last_name assignee_last_name
        FROM activities a LEFT JOIN organizations o ON o.id=a.organization_id LEFT JOIN users u ON u.id=a.assigned_to_id
        WHERE ($1::boolean=false OR a.assigned_to_id=$2::uuid) AND a.scheduled_at IS NOT NULL ORDER BY a.scheduled_at`,[staff,userId??null]),
      this.db.query(`SELECT t.id,t.title,t.status,t.priority,t.due_at,t.organization_id,t.lead_id,o.name organization_name,u.first_name assignee_first_name,u.last_name assignee_last_name
        FROM tasks t LEFT JOIN organizations o ON o.id=t.organization_id LEFT JOIN users u ON u.id=t.assigned_to_id
        WHERE ($1::boolean=false OR t.assigned_to_id=$2::uuid) AND t.due_at IS NOT NULL ORDER BY t.due_at`,[staff,userId??null])
    ]);
    return {activities:activities.rows,tasks:tasks.rows};
  }

  async staffHome(userId:string){
    const [summary,tasks,leads,followups]=await Promise.all([
      this.db.query(`SELECT
        (SELECT COUNT(*)::int FROM tasks WHERE assigned_to_id=$1 AND status NOT IN('COMPLETED','CANCELLED')) open_tasks,
        (SELECT COUNT(*)::int FROM tasks WHERE assigned_to_id=$1 AND status NOT IN('COMPLETED','CANCELLED') AND due_at<NOW()) overdue_tasks,
        (SELECT COUNT(*)::int FROM leads WHERE assigned_to_id=$1 AND record_type='LEAD') assigned_leads,
        (SELECT COUNT(*)::int FROM activities WHERE assigned_to_id=$1 AND status='PLANNED' AND scheduled_at::date=CURRENT_DATE) followups_today`,[userId]),
      this.db.query(`SELECT id,title,status,priority,due_at FROM tasks WHERE assigned_to_id=$1 AND status NOT IN('COMPLETED','CANCELLED') ORDER BY due_at NULLS LAST LIMIT 6`,[userId]),
      this.db.query(`SELECT l.id,l.stage,l.priority,l.pursuit_progress,o.name organization_name FROM leads l JOIN organizations o ON o.id=l.organization_id WHERE l.assigned_to_id=$1 AND l.record_type='LEAD' ORDER BY l.updated_at DESC LIMIT 6`,[userId]),
      this.db.query(`SELECT a.id,a.title,a.activity_type,a.scheduled_at,o.name organization_name FROM activities a LEFT JOIN organizations o ON o.id=a.organization_id WHERE a.assigned_to_id=$1 AND a.status='PLANNED' AND a.scheduled_at>=CURRENT_DATE ORDER BY a.scheduled_at LIMIT 6`,[userId])
    ]);
    return {summary:summary.rows[0],tasks:tasks.rows,leads:leads.rows,followups:followups.rows};
  }

  async latestActivities(){
    const r=await this.db.query(`SELECT al.id,al.action,al.module,al.entity_type,al.entity_id,al.created_at,
      u.id actor_user_id,u.first_name actor_first_name,u.last_name actor_last_name,u.email actor_email,
      r.name actor_role_name,d.name actor_department_name,
      CASE WHEN al.entity_type='task' THEN t.title
           WHEN al.entity_type='lead' THEN o.name
           ELSE NULL END entity_title,
      CASE WHEN al.entity_type='lead' THEN l.record_type::text ELSE NULL END record_type,
      CASE WHEN al.entity_type='lead' THEN l.stage::text ELSE NULL END lead_stage,
      CASE WHEN al.entity_type='task' THEN '/tasks/'||t.id::text
           WHEN al.entity_type='lead' AND l.record_type='LEAD' THEN '/leads/'||l.id::text
           WHEN al.entity_type='lead' AND l.record_type='PROSPECT' THEN '/prospects'
           WHEN al.entity_type='lead' AND l.record_type='CLIENT' THEN '/clients'
           ELSE NULL END href
      FROM audit_logs al
      LEFT JOIN users u ON u.id=al.actor_user_id
      LEFT JOIN roles r ON r.id=u.role_id
      LEFT JOIN departments d ON d.id=u.department_id
      LEFT JOIN tasks t ON al.entity_type='task' AND t.id=al.entity_id
      LEFT JOIN leads l ON al.entity_type='lead' AND l.id=al.entity_id
      LEFT JOIN organizations o ON o.id=l.organization_id
      WHERE al.module IN('leads','tasks','clients')
         OR al.action IN('LEAD_CONVERTED_TO_PROSPECT','PROSPECT_REVIEW_REJECTED','PROSPECT_CONVERTED_TO_CLIENT','CLIENT_REVENUE_RECORDED')
      ORDER BY al.created_at DESC LIMIT 500`);
    return r.rows;
  }

  async auditFeed(limit=250,offset=0){
    const safeLimit=Math.min(500,Math.max(25,Math.floor(limit||250)));
    const safeOffset=Math.max(0,Math.floor(offset||0));
    const count=await this.db.query(`SELECT COUNT(*)::int total FROM audit_logs`);
    try {
      const items=await this.db.query(`SELECT al.id,al.action,al.module,al.entity_type,al.entity_id,al.old_values,al.new_values,al.created_at,al.ip_address,al.user_agent,
        al.actor_user_id_snapshot,al.actor_name_snapshot,al.actor_email_snapshot,al.actor_role_snapshot,al.actor_department_snapshot,
        u.id actor_user_id,u.first_name actor_first_name,u.last_name actor_last_name,u.email actor_email,
        r.code actor_role_code,r.name actor_role_name,d.name actor_department_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id=al.actor_user_id
        LEFT JOIN roles r ON r.id=u.role_id
        LEFT JOIN departments d ON d.id=u.department_id
        ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,[safeLimit,safeOffset]);
      return {items:items.rows,total:count.rows[0]?.total||0,limit:safeLimit,offset:safeOffset};
    } catch (error) {
      if ((error as {code?:string})?.code !== '42703') throw error;
      // Backwards-compatible read while migration 040 is pending. Apply 040 so
      // deleted-user identity snapshots are retained permanently.
      const items=await this.db.query(`SELECT al.id,al.action,al.module,al.entity_type,al.entity_id,al.old_values,al.new_values,al.created_at,al.ip_address,al.user_agent,
        NULL::uuid actor_user_id_snapshot,NULL::text actor_name_snapshot,NULL::text actor_email_snapshot,NULL::text actor_role_snapshot,NULL::text actor_department_snapshot,
        u.id actor_user_id,u.first_name actor_first_name,u.last_name actor_last_name,u.email actor_email,
        r.code actor_role_code,r.name actor_role_name,d.name actor_department_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id=al.actor_user_id
        LEFT JOIN roles r ON r.id=u.role_id
        LEFT JOIN departments d ON d.id=u.department_id
        ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,[safeLimit,safeOffset]);
      return {items:items.rows,total:count.rows[0]?.total||0,limit:safeLimit,offset:safeOffset};
    }
  }

}
