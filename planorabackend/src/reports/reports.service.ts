import {BadRequestException,Injectable} from '@nestjs/common';
import {DatabaseService} from '../database/database.service.js';
import {StaffMailService} from '../mailer/staff-mail.service.js';
import {AuditService} from '../audit/audit.service.js';

type AuditCtx={actorUserId:string;ipAddress?:string;userAgent?:string};
type ReportFilters={
  from?:string;to?:string;staffId?:string;departmentId?:string;organizationId?:string;
  recordType?:string;leadStage?:string;taskStatus?:string;focus?:string;
};

@Injectable()
export class ReportsService{
  constructor(private readonly db:DatabaseService,private readonly mail:StaffMailService,private readonly audit:AuditService){}

  async company(filters:ReportFilters={}){
    const leadParams=[filters.from||null,filters.to||null,filters.staffId||null,filters.departmentId||null,filters.organizationId||null,filters.recordType||null,filters.leadStage||null];
    const taskParams=[filters.from||null,filters.to||null,filters.staffId||null,filters.departmentId||null,filters.organizationId||null,filters.taskStatus||null];
    const staffParams=[filters.from||null,filters.to||null,filters.staffId||null,filters.departmentId||null,filters.organizationId||null,filters.leadStage||null,filters.taskStatus||null];
    const followupParams=[filters.from||null,filters.to||null,filters.staffId||null,filters.departmentId||null,filters.organizationId||null];
    const organizationParams=[filters.organizationId||null];

    const leadWhere=`($1::date IS NULL OR l.created_at::date >= $1::date)
      AND ($2::date IS NULL OR l.created_at::date <= $2::date)
      AND ($3::uuid IS NULL OR l.assigned_to_id = $3::uuid)
      AND ($4::uuid IS NULL OR u.department_id = $4::uuid)
      AND ($5::uuid IS NULL OR l.organization_id = $5::uuid)
      AND ($6::text IS NULL OR l.record_type::text = $6::text)
      AND ($7::text IS NULL OR l.stage::text = $7::text)`;

    const taskWhere=`($1::date IS NULL OR t.created_at::date >= $1::date)
      AND ($2::date IS NULL OR t.created_at::date <= $2::date)
      AND ($3::uuid IS NULL OR t.assigned_to_id = $3::uuid)
      AND ($4::uuid IS NULL OR tu.department_id = $4::uuid)
      AND ($5::uuid IS NULL OR t.organization_id = $5::uuid)
      AND ($6::text IS NULL OR t.status::text = $6::text)`;

    const [lead,stages,tasks,delivery,followups,conversion,organizations,commercial,communications,options]=await Promise.all([
      this.db.query(`SELECT l.record_type::text AS record_type,COUNT(*)::int AS count FROM leads l LEFT JOIN users u ON u.id=l.assigned_to_id WHERE ${leadWhere} GROUP BY l.record_type ORDER BY l.record_type`,leadParams),
      this.db.query(`SELECT l.stage::text AS stage,COUNT(*)::int AS count FROM leads l LEFT JOIN users u ON u.id=l.assigned_to_id WHERE l.record_type='LEAD' AND ${leadWhere} GROUP BY l.stage ORDER BY count DESC`,leadParams),
      this.db.query(`SELECT t.status::text AS status,COUNT(*)::int AS count FROM tasks t LEFT JOIN users tu ON tu.id=t.assigned_to_id WHERE ${taskWhere} GROUP BY t.status ORDER BY t.status`,taskParams),
      this.db.query(`SELECT u.id,u.first_name,u.last_name,u.job_title,d.name AS department_name,
        COUNT(t.id)::int AS assigned_tasks,
        COUNT(t.id) FILTER(WHERE t.status='COMPLETED')::int AS completed_tasks,
        COUNT(t.id) FILTER(WHERE t.status NOT IN ('COMPLETED','CANCELLED') AND t.due_at<NOW())::int AS overdue_tasks,
        (SELECT COUNT(*)::int FROM leads l2 WHERE l2.assigned_to_id=u.id AND l2.record_type='LEAD'
          AND ($1::date IS NULL OR l2.created_at::date >= $1::date) AND ($2::date IS NULL OR l2.created_at::date <= $2::date)
          AND ($5::uuid IS NULL OR l2.organization_id=$5::uuid)
          AND ($6::text IS NULL OR l2.stage::text=$6::text)) AS active_leads
        FROM users u
        LEFT JOIN departments d ON d.id=u.department_id
        LEFT JOIN tasks t ON t.assigned_to_id=u.id
          AND ($1::date IS NULL OR t.created_at::date >= $1::date) AND ($2::date IS NULL OR t.created_at::date <= $2::date)
          AND ($5::uuid IS NULL OR t.organization_id=$5::uuid) AND ($7::text IS NULL OR t.status::text=$7::text)
        WHERE u.status IN ('ACTIVE','INVITED')
          AND ($3::uuid IS NULL OR u.id=$3::uuid) AND ($4::uuid IS NULL OR u.department_id=$4::uuid)
        GROUP BY u.id,u.first_name,u.last_name,u.job_title,d.name
        ORDER BY completed_tasks DESC,overdue_tasks ASC,u.first_name,u.last_name`,staffParams),
      this.db.query(`SELECT
        COUNT(*) FILTER(WHERE a.status NOT IN ('COMPLETED','CANCELLED') AND a.scheduled_at::date=CURRENT_DATE)::int AS due_today,
        COUNT(*) FILTER(WHERE a.status NOT IN ('COMPLETED','CANCELLED') AND a.scheduled_at<NOW())::int AS overdue,
        COUNT(*) FILTER(WHERE a.status='COMPLETED')::int AS completed
        FROM activities a LEFT JOIN users au ON au.id=a.assigned_to_id
        WHERE a.activity_type='FOLLOW_UP'
          AND ($1::date IS NULL OR a.created_at::date >= $1::date) AND ($2::date IS NULL OR a.created_at::date <= $2::date)
          AND ($3::uuid IS NULL OR a.assigned_to_id=$3::uuid) AND ($4::uuid IS NULL OR au.department_id=$4::uuid)
          AND ($5::uuid IS NULL OR a.organization_id=$5::uuid)`,followupParams),
      this.db.query(`SELECT
        COUNT(*) FILTER(WHERE l.record_type='LEAD')::int AS leads,
        COUNT(*) FILTER(WHERE l.record_type='PROSPECT')::int AS prospects,
        COUNT(*) FILTER(WHERE l.record_type='CLIENT')::int AS clients
        FROM leads l LEFT JOIN users u ON u.id=l.assigned_to_id WHERE ${leadWhere}`,leadParams),
      this.db.query(`SELECT o.id,o.name,o.industry,o.status::text AS status,
        COUNT(DISTINCT l.id)::int AS crm_records,
        COUNT(DISTINCT c.id)::int AS contacts,
        COUNT(DISTINCT t.id)::int AS tasks,
        COUNT(DISTINCT t.id) FILTER(WHERE t.status NOT IN ('COMPLETED','CANCELLED') AND t.due_at<NOW())::int AS overdue_tasks
        FROM organizations o
        LEFT JOIN leads l ON l.organization_id=o.id
        LEFT JOIN contacts c ON c.organization_id=o.id
        LEFT JOIN tasks t ON t.organization_id=o.id
        WHERE ($1::uuid IS NULL OR o.id=$1::uuid)
        GROUP BY o.id,o.name,o.industry,o.status
        ORDER BY crm_records DESC,tasks DESC,o.name LIMIT 100`,organizationParams),
      this.db.query(`SELECT COALESCE(SUM(l.expected_revenue) FILTER(WHERE l.record_type='PROSPECT'),0)::float expected_revenue,
        COALESCE(SUM(l.actual_revenue) FILTER(WHERE l.record_type='CLIENT'),0)::float realized_revenue
        FROM leads l LEFT JOIN users u ON u.id=l.assigned_to_id WHERE ${leadWhere}`,leadParams),
      this.db.query(`SELECT
        (SELECT COUNT(*)::int FROM crm_mail_messages m WHERE ($1::date IS NULL OR m.created_at::date >= $1::date) AND ($2::date IS NULL OR m.created_at::date <= $2::date) AND m.direction='OUTBOUND') outbound_mail,
        (SELECT COUNT(*)::int FROM crm_mail_messages m WHERE ($1::date IS NULL OR m.created_at::date >= $1::date) AND ($2::date IS NULL OR m.created_at::date <= $2::date) AND m.direction='INBOUND') inbound_mail,
        (SELECT COUNT(*)::int FROM letter_documents d WHERE ($1::date IS NULL OR d.created_at::date >= $1::date) AND ($2::date IS NULL OR d.created_at::date <= $2::date)) letters,
        (SELECT COUNT(*)::int FROM shared_files f WHERE ($1::date IS NULL OR f.created_at::date >= $1::date) AND ($2::date IS NULL OR f.created_at::date <= $2::date)) shared_files`,[filters.from||null,filters.to||null]),
      this.options(),
    ]);

    return{
      range:{from:filters.from||null,to:filters.to||null},filters:{...filters},
      lifecycle:lead.rows,leadStages:stages.rows,tasks:tasks.rows,staff:delivery.rows,
      followUps:followups.rows[0]??{due_today:0,overdue:0,completed:0},
      conversion:conversion.rows[0]??{leads:0,prospects:0,clients:0},
      organizations:organizations.rows,
      commercial:commercial.rows[0]??{expected_revenue:0,realized_revenue:0},
      communications:communications.rows[0]??{outbound_mail:0,inbound_mail:0,letters:0,shared_files:0},
      options,
    };
  }

  async emailCompanyReport(filters:ReportFilters,recipient:string,ctx?:AuditCtx){
    const data=await this.company(filters);
    const csv=this.csv(data);
    const date=new Date().toISOString().slice(0,10);
    const filename=`PlanoraHub-management-report-${date}.csv`;
    const delivery=await this.mail.sendWorkspaceMail({
      to:[recipient],
      subject:`PlanoraHub management report · ${date}`,
      body:`Your requested PlanoraHub management report is attached. The attachment reflects the same filters used when you exported the report from the CRM.`,
      senderName:'PlanoraHub Reports',
      attachments:[{filename,content:Buffer.from(csv,'utf8').toString('base64'),contentType:'text/csv; charset=utf-8'}],
      idempotencyKey:`management-report/${recipient}/${Date.now()}`,
    });
    if(delivery.status!=='SENT')throw new BadRequestException(delivery.message);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'REPORT_EMAILED',module:'reports',entityType:'management_report',newValues:{recipient,filename,filters:{...filters}},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return{recipient,filename,status:delivery.status};
  }

  async auditReport(action:'REPORT_GENERATED'|'REPORT_DOWNLOADED',filters:ReportFilters,ctx:AuditCtx){
    const input={actorUserId:ctx.actorUserId,action,module:'reports',entityType:'management_report',newValues:{filters:{...filters}},ipAddress:ctx.ipAddress,userAgent:ctx.userAgent};
    if(action==='REPORT_GENERATED')await this.audit.logOnce(input,60);else await this.audit.log(input);
    return true;
  }

  private csv(data:any){
    const rows:string[][]=[
      ['PlanoraHub Management Report'],
      ['From',data.range.from||'All'],
      ['To',data.range.to||'All'],
      [],
      ['Commercial'],
      ['Expected revenue',String(data.commercial.expected_revenue)],
      ['Realized revenue',String(data.commercial.realized_revenue)],
      [],
      ['Staff','Department','Assigned tasks','Completed','Overdue','Active Leads'],
      ...data.staff.map((x:any)=>[`${x.first_name} ${x.last_name}`,x.department_name||'',String(x.assigned_tasks),String(x.completed_tasks),String(x.overdue_tasks),String(x.active_leads)]),
      [],
      ['Organizations','Industry','CRM records','Contacts','Tasks','Overdue'],
      ...data.organizations.map((x:any)=>[x.name,x.industry||'',String(x.crm_records),String(x.contacts),String(x.tasks),String(x.overdue_tasks)]),
    ];
    return rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  }

  private async options(){
    const [staff,departments,organizations,stages,statuses]=await Promise.all([
      this.db.query(`SELECT id,first_name,last_name,job_title FROM users WHERE status IN ('ACTIVE','INVITED') ORDER BY first_name,last_name`),
      this.db.query(`SELECT id,name FROM departments ORDER BY name`),
      this.db.query(`SELECT id,name FROM organizations WHERE status<>'ARCHIVED' ORDER BY name LIMIT 500`),
      this.db.query(`SELECT DISTINCT stage::text AS value FROM leads ORDER BY value`),
      this.db.query(`SELECT DISTINCT status::text AS value FROM tasks ORDER BY value`),
    ]);
    return{staff:staff.rows,departments:departments.rows,organizations:organizations.rows,leadStages:stages.rows.map(r=>r.value),taskStatuses:statuses.rows.map(r=>r.value)};
  }
}
