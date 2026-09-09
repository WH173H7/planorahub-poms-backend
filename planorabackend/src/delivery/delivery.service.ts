import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';

type Ctx={actorUserId?:string;ipAddress?:string;userAgent?:string};
@Injectable()
export class DeliveryService {
  constructor(private readonly db:DatabaseService,private readonly audit:AuditService){}

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
      this.db.query(`SELECT al.id,al.action,al.created_at,u.first_name,u.last_name FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_user_id ORDER BY al.created_at DESC LIMIT 8`),
      this.db.query(`SELECT a.id,a.title,a.activity_type,a.scheduled_at,o.name organization_name,u.first_name assignee_first_name,u.last_name assignee_last_name
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
    const current=await this.db.query(`SELECT * FROM leads WHERE id=$1 AND record_type='LEAD' LIMIT 1`,[id]);
    if(!current.rows[0])throw new NotFoundException('Lead not found');
    if(current.rows[0].stage!=='READY_FOR_PROSPECT_REVIEW')throw new BadRequestException('Lead must be ready for Prospect review first');
    const r=await this.db.query(`UPDATE leads SET record_type='PROSPECT',stage='QUALIFIED',converted_to_prospect_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`,[id]);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'LEAD_CONVERTED_TO_PROSPECT',module:'leads',entityType:'lead',entityId:id,oldValues:current.rows[0],newValues:r.rows[0],ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return r.rows[0];
  }

  async rejectProspect(id:string,reason:string|undefined,ctx?:Ctx){
    const current=await this.db.query(`SELECT * FROM leads WHERE id=$1 AND record_type='LEAD' LIMIT 1`,[id]);
    if(!current.rows[0])throw new NotFoundException('Lead not found');
    const note=reason?.trim();
    const r=await this.db.query(`UPDATE leads SET stage='ENGAGED',notes=CASE WHEN $2::text IS NULL THEN notes ELSE CONCAT_WS(E'\n',notes,'Prospect review: '||$2) END,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,note||null]);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'PROSPECT_REVIEW_REJECTED',module:'leads',entityType:'lead',entityId:id,oldValues:current.rows[0],newValues:r.rows[0],ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return r.rows[0];
  }

  async convertClient(id:string,ctx?:Ctx){
    const current=await this.db.query(`SELECT * FROM leads WHERE id=$1 AND record_type='PROSPECT' LIMIT 1`,[id]);
    if(!current.rows[0])throw new NotFoundException('Prospect not found');
    const r=await this.db.query(`UPDATE leads SET record_type='CLIENT',converted_to_client_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`,[id]);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'PROSPECT_CONVERTED_TO_CLIENT',module:'leads',entityType:'lead',entityId:id,oldValues:current.rows[0],newValues:r.rows[0],ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return r.rows[0];
  }

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
  async auditFeed(){
    const r=await this.db.query(`SELECT al.id,al.action,al.module,al.entity_type,al.entity_id,al.created_at,al.ip_address,al.user_agent,
      u.id actor_user_id,u.first_name actor_first_name,u.last_name actor_last_name,u.email actor_email,
      r.code actor_role_code,r.name actor_role_name,d.name actor_department_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id=al.actor_user_id
      LEFT JOIN roles r ON r.id=u.role_id
      LEFT JOIN departments d ON d.id=u.department_id
      ORDER BY al.created_at DESC LIMIT 500`);
    return r.rows;
  }

}
