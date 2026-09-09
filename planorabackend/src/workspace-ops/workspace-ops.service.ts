import {BadRequestException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {SupabaseService} from '../supabase/supabase.service.js';
import {DatabaseService} from '../database/database.service.js';
import {AuditService} from '../audit/audit.service.js';
@Injectable()
export class WorkspaceOpsService{
 constructor(private readonly db:DatabaseService,private readonly supabase:SupabaseService,private readonly audit:AuditService){}
 async departments(){return (await this.db.query(`SELECT d.*,(SELECT COUNT(*)::int FROM users u WHERE u.department_id=d.id AND u.status NOT IN('DISABLED')) staff_count,(SELECT COUNT(*)::int FROM teams t WHERE t.department_id=d.id AND t.is_active=true) team_count FROM departments d ORDER BY d.is_active DESC,d.name`)).rows}
 async createDepartment(b:{name?:string;description?:string}){const name=b.name?.trim();if(!name)throw new BadRequestException('Department name is required');return (await this.db.query(`INSERT INTO departments(name,description) VALUES($1,$2) RETURNING *`,[name,b.description?.trim()||null])).rows[0]}
 async setDepartment(id:string,b:{name?:string;description?:string;isActive?:boolean}){const r=await this.db.query(`UPDATE departments SET name=COALESCE(NULLIF($2,''),name),description=$3,is_active=COALESCE($4,is_active),updated_at=NOW() WHERE id=$1 RETURNING *`,[id,b.name?.trim()||'',b.description?.trim()||null,b.isActive??null]);if(!r.rows[0])throw new NotFoundException('Department not found');return r.rows[0]}
 async teams(departmentId?:string){return (await this.db.query(`SELECT t.*,d.name department_name,u.first_name manager_first_name,u.last_name manager_last_name,(SELECT COUNT(*)::int FROM team_members tm WHERE tm.team_id=t.id) member_count FROM teams t LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN users u ON u.id=t.manager_id WHERE ($1::uuid IS NULL OR t.department_id=$1) ORDER BY t.is_active DESC,d.name,t.name`,[departmentId||null])).rows}
 async createTeam(b:{name?:string;description?:string;departmentId?:string;managerId?:string|null}){if(!b.name?.trim())throw new BadRequestException('Team name is required');return (await this.db.query(`INSERT INTO teams(name,description,department_id,manager_id) VALUES($1,$2,$3,$4) RETURNING *`,[b.name.trim(),b.description?.trim()||null,b.departmentId||null,b.managerId||null])).rows[0]}
 async setTeam(id:string,b:{name?:string;description?:string;managerId?:string|null;isActive?:boolean}){const r=await this.db.query(`UPDATE teams SET name=COALESCE(NULLIF($2,''),name),description=$3,manager_id=$4,is_active=COALESCE($5,is_active),updated_at=NOW() WHERE id=$1 RETURNING *`,[id,b.name?.trim()||'',b.description?.trim()||null,b.managerId||null,b.isActive??null]);if(!r.rows[0])throw new NotFoundException('Team not found');return r.rows[0]}
 async notifications(userId:string){return (await this.db.query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60`,[userId])).rows}
 async readNotification(userId:string,id:string){const row=(await this.db.query(`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING *`,[id,userId])).rows[0]??null;if(row?.broadcast_id)await this.db.query(`UPDATE broadcast_recipients SET read_at=COALESCE(read_at,NOW()) WHERE broadcast_id=$1 AND user_id=$2`,[row.broadcast_id,userId]);return row}
 async readAll(userId:string){await this.db.query(`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=$1`,[userId]);await this.db.query(`UPDATE broadcast_recipients SET read_at=COALESCE(read_at,NOW()) WHERE user_id=$1 AND in_app_sent_at IS NOT NULL`,[userId]);return true}
 async directContacts(userId:string,roleCode:string){const admin=roleCode==='SUPER_ADMIN';await this.db.query(`UPDATE direct_chat_messages m SET delivered_at=COALESCE(delivered_at,NOW()) FROM direct_chat_conversations c WHERE m.conversation_id=c.id AND m.sender_user_id<>$1 AND (c.user_a_id=$1 OR c.user_b_id=$1)`,[userId]);return (await this.db.query(`SELECT u.id,u.first_name,u.last_name,u.job_title,u.role_id,COALESCE(x.unread_count,0)::int unread_count,x.last_message,x.last_message_at FROM users u LEFT JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE m.sender_user_id=u.id AND m.read_at IS NULL)::int unread_count,(ARRAY_AGG(m.body ORDER BY m.created_at DESC))[1] last_message,MAX(m.created_at) last_message_at FROM direct_chat_conversations c JOIN direct_chat_messages m ON m.conversation_id=c.id WHERE (c.user_a_id=$1 AND c.user_b_id=u.id) OR (c.user_b_id=$1 AND c.user_a_id=u.id)) x ON TRUE WHERE u.status='ACTIVE' AND u.id<>$1 AND ($2::boolean=true OR EXISTS(SELECT 1 FROM roles r WHERE r.id=u.role_id AND r.code='SUPER_ADMIN')) ORDER BY x.last_message_at DESC NULLS LAST,u.first_name,u.last_name`,[userId,admin])).rows}
 async conversation(userId:string,otherId:string){const c=await this.ensureConversation(userId,otherId);await this.db.query(`UPDATE direct_chat_messages SET delivered_at=COALESCE(delivered_at,NOW()),read_at=COALESCE(read_at,NOW()) WHERE conversation_id=$1 AND sender_user_id<>$2`,[c.id,userId]);const messages=(await this.db.query(`SELECT m.*,u.first_name,u.last_name,COALESCE(json_agg(json_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'file_size',a.file_size)) FILTER(WHERE a.id IS NOT NULL),'[]') attachments FROM direct_chat_messages m JOIN users u ON u.id=m.sender_user_id LEFT JOIN direct_chat_attachments a ON a.message_id=m.id WHERE m.conversation_id=$1 GROUP BY m.id,u.first_name,u.last_name ORDER BY m.created_at`,[c.id])).rows;return {conversation:c,messages}}
 async send(userId:string,otherId:string,body:string){const text=body?.trim();if(!text)throw new BadRequestException('Message cannot be empty');const c=await this.ensureConversation(userId,otherId);const m=(await this.db.query(`INSERT INTO direct_chat_messages(conversation_id,sender_user_id,body) VALUES($1,$2,$3) RETURNING *`,[c.id,userId,text])).rows[0];await this.db.query(`INSERT INTO notifications(user_id,title,body,kind,href) SELECT $1,'New message',first_name||' sent you a message','CHAT','/home' FROM users WHERE id=$2`,[otherId,userId]);await this.audit.log({actorUserId:userId,action:'CHAT_MESSAGE_SENT',module:'communications',entityType:'direct_chat_message',entityId:String(m.id),newValues:{recipientUserId:otherId}});return m}
 async uploadChat(userId:string,otherId:string,file:any){if(!file)throw new BadRequestException('File is required');if(file.size>10*1024*1024)throw new BadRequestException('File must be 10 MB or smaller');const c=await this.ensureConversation(userId,otherId);const safe=String(file.originalname||'attachment').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`chat/${c.id}/${randomUUID()}-${safe}`;const up=await this.supabase.admin.storage.from('task-attachments').upload(path,file.buffer,{contentType:file.mimetype,upsert:false});if(up.error)throw new BadRequestException('Attachment upload failed');const m=(await this.db.query(`INSERT INTO direct_chat_messages(conversation_id,sender_user_id,body) VALUES($1,$2,$3) RETURNING *`,[c.id,userId,`Shared ${file.originalname}`])).rows[0];await this.db.query(`INSERT INTO direct_chat_attachments(message_id,file_name,mime_type,file_size,storage_path) VALUES($1,$2,$3,$4,$5)`,[m.id,file.originalname,file.mimetype,file.size,path]);await this.db.query(`INSERT INTO notifications(user_id,title,body,kind,href) VALUES($1,'New chat attachment',$2,'CHAT','/home')`,[otherId,file.originalname]);await this.audit.log({actorUserId:userId,action:'CHAT_ATTACHMENT_SENT',module:'communications',entityType:'direct_chat_message',entityId:String(m.id),newValues:{recipientUserId:otherId,fileName:file.originalname,fileSize:file.size}});return m}
 async chatAttachment(userId:string,id:string){const r=await this.db.query(`SELECT a.*,c.user_a_id,c.user_b_id FROM direct_chat_attachments a JOIN direct_chat_messages m ON m.id=a.message_id JOIN direct_chat_conversations c ON c.id=m.conversation_id WHERE a.id=$1 AND ($2=c.user_a_id OR $2=c.user_b_id)`,[id,userId]);const a=r.rows[0];if(!a)throw new NotFoundException('Attachment not found');const signed=await this.supabase.admin.storage.from(a.storage_bucket).createSignedUrl(a.storage_path,300);if(signed.error)throw new BadRequestException('Unable to open attachment');return {url:signed.data.signedUrl,fileName:a.file_name,mimeType:a.mime_type}}
 async search(q:string,admin:boolean,userId:string){
  const x=q?.trim();
  if(!x||x.length<2)return[];
  const like=`%${x}%`;
  const r=await this.db.query(`
    SELECT * FROM (
      SELECT 'LEAD' kind,l.id,o.name title,l.stage::text subtitle,
             CASE WHEN $2 THEN '/leads/'||l.id ELSE '/my-work/leads/'||l.id END href
      FROM leads l
      JOIN organizations o ON o.id=l.organization_id
      WHERE l.record_type='LEAD'
        AND ($2 OR l.assigned_to_id=$3 OR EXISTS(
          SELECT 1 FROM team_members tm
          WHERE tm.user_id=$3 AND tm.team_id=l.assigned_team_id
        ))

      UNION ALL
      SELECT 'ORGANIZATION',o.id,o.name,COALESCE(o.industry,''),'/organizations/'||o.id
      FROM organizations o
      WHERE $2

      UNION ALL
      SELECT 'CONTACT',c.id,TRIM(c.first_name||' '||c.last_name),COALESCE(o.name,''),'/contacts'
      FROM contacts c
      JOIN organizations o ON o.id=c.organization_id
      WHERE $2

      UNION ALL
      SELECT 'TASK',t.id,t.title,COALESCE(t.status::text,''),'/tasks/'||t.id
      FROM tasks t
      WHERE $2 OR t.assigned_to_id=$3 OR t.created_by_id=$3

      UNION ALL
      SELECT 'STAFF',u.id,TRIM(u.first_name||' '||u.last_name),COALESCE(u.job_title,''),'/staff/'||u.id
      FROM users u
      WHERE $2

      UNION ALL
      SELECT 'FILE',sf.id,sf.file_name,COALESCE(f.name,''),'/shared-files'
      FROM shared_files sf
      JOIN shared_folders f ON f.id=sf.folder_id
      WHERE $2 OR f.created_by_id=$3 OR (
        f.publication_status='PUBLISHED' AND (
          f.visibility='EVERYONE'
          OR (f.visibility='SELECTED' AND $3=ANY(f.visibility_ids))
          OR (f.visibility='DEPARTMENT' AND EXISTS(
            SELECT 1 FROM users me WHERE me.id=$3 AND me.department_id=ANY(f.visibility_ids)
          ))
          OR (f.visibility='TEAM' AND EXISTS(
            SELECT 1 FROM team_members tm WHERE tm.user_id=$3 AND tm.team_id=ANY(f.visibility_ids)
          ))
          OR (f.visibility='LEAD' AND EXISTS(
            SELECT 1 FROM leads l
            WHERE l.id=ANY(f.visibility_ids)
              AND (l.assigned_to_id=$3 OR EXISTS(
                SELECT 1 FROM team_members tm WHERE tm.user_id=$3 AND tm.team_id=l.assigned_team_id
              ))
          ))
          OR (f.visibility='TASK' AND EXISTS(
            SELECT 1 FROM tasks t
            WHERE t.id=ANY(f.visibility_ids) AND (t.assigned_to_id=$3 OR t.created_by_id=$3)
          ))
        )
      )
    ) s
    WHERE CONCAT_WS(' ',title,subtitle) ILIKE $1
    ORDER BY title
    LIMIT 24
  `,[like,admin,userId]);
  return r.rows
}
 async broadcasts(){return (await this.db.query(`SELECT b.*,u.first_name,u.last_name,(SELECT COUNT(*)::int FROM broadcast_recipients br WHERE br.broadcast_id=b.id) recipient_count,(SELECT COUNT(*)::int FROM broadcast_recipients br WHERE br.broadcast_id=b.id AND br.read_at IS NOT NULL) read_count FROM broadcasts b LEFT JOIN users u ON u.id=b.created_by_id ORDER BY b.created_at DESC LIMIT 100`)).rows}
 async createBroadcast(userId:string,b:any){if(!b.title?.trim()||!b.body?.trim())throw new BadRequestException('Title and message are required');const ids=Array.isArray(b.audienceIds)?b.audienceIds:[];const row=(await this.db.query(`INSERT INTO broadcasts(title,body,priority,channel,audience_type,audience_ids,created_by_id,scheduled_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[b.title.trim(),b.body.trim(),b.priority||'NORMAL',b.channel||'IN_APP',b.audienceType||'EVERYONE',ids,userId,b.scheduledAt||null,b.expiresAt||null])).rows[0];const recipients=await this.db.query(`SELECT DISTINCT u.id FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN team_members tm ON tm.user_id=u.id WHERE u.status='ACTIVE' AND r.code<>'SUPER_ADMIN' AND ($1='EVERYONE' OR ($1='DEPARTMENT' AND u.department_id=ANY($2::uuid[])) OR ($1='TEAM' AND tm.team_id=ANY($2::uuid[])) OR ($1='ROLE' AND u.role_id=ANY($2::uuid[])) OR ($1='SELECTED' AND u.id=ANY($2::uuid[])))`,[row.audience_type,ids]);for(const u of recipients.rows){await this.db.query(`INSERT INTO broadcast_recipients(broadcast_id,user_id,in_app_sent_at,email_status) VALUES($1,$2,CASE WHEN $3 IN('IN_APP','BOTH') THEN NOW() END,CASE WHEN $3 IN('EMAIL','BOTH') THEN 'PENDING_WORKSPACE' ELSE 'NOT_REQUESTED' END) ON CONFLICT DO NOTHING`,[row.id,u.id,row.channel]);if(['IN_APP','BOTH'].includes(row.channel))await this.db.query(`INSERT INTO notifications(user_id,title,body,kind,href,broadcast_id) VALUES($1,$2,$3,'BROADCAST','/home',$4)`,[u.id,row.title,row.body,row.id])}return {...row,recipient_count:recipients.rows.length}}

 async reminders(userId:string,admin:boolean){return (await this.db.query(`SELECT cr.*,u.first_name,u.last_name FROM calendar_reminders cr JOIN users u ON u.id=cr.user_id WHERE ($1::boolean=true OR cr.user_id=$2) ORDER BY starts_at`,[admin,userId])).rows}
 async createReminder(userId:string,b:{title?:string;notes?:string;startsAt?:string;reminderAt?:string|null}){if(!b.title?.trim()||!b.startsAt)throw new BadRequestException('Title and date are required');const row=(await this.db.query(`INSERT INTO calendar_reminders(user_id,title,notes,starts_at,reminder_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,[userId,b.title.trim(),b.notes?.trim()||null,b.startsAt,b.reminderAt||null])).rows[0];await this.audit.log({actorUserId:userId,action:'CALENDAR_REMINDER_CREATED',module:'calendar',entityType:'calendar_reminder',entityId:String(row.id),newValues:{title:row.title,startsAt:row.starts_at}});return row}
 async teamMembers(id:string){return (await this.db.query(`SELECT u.id,u.first_name,u.last_name,u.email,u.job_title,d.name department_name,(u.id=t.manager_id) is_team_lead FROM teams t JOIN team_members tm ON tm.team_id=t.id JOIN users u ON u.id=tm.user_id LEFT JOIN departments d ON d.id=u.department_id WHERE t.id=$1 ORDER BY (u.id=t.manager_id) DESC,u.first_name,u.last_name`,[id])).rows}
 async setTeamMembers(id:string,b:{memberIds?:string[];managerId?:string|null}){const ids=[...new Set(b.memberIds??[])];const c=await this.db.getClient();try{await c.query('BEGIN');await c.query(`DELETE FROM team_members WHERE team_id=$1`,[id]);for(const uid of ids)await c.query(`INSERT INTO team_members(team_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,uid]);if(b.managerId){await c.query(`INSERT INTO team_members(team_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,b.managerId]);}await c.query(`UPDATE teams SET manager_id=$2,updated_at=NOW() WHERE id=$1`,[id,b.managerId||null]);await c.query('COMMIT');return this.teamMembers(id)}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async staffOpsAnalytics(){const [rev,staff,stages]=await Promise.all([this.db.query(`SELECT COALESCE(SUM(proposed_revenue),0)::float proposed,COALESCE(SUM(proposed_revenue*revenue_probability/100),0)::float weighted,COALESCE(SUM(actual_revenue),0)::float actual FROM leads WHERE record_type IN('LEAD','PROSPECT','CLIENT')`),this.db.query(`SELECT u.id,u.first_name,u.last_name,d.name department_name,COUNT(DISTINCT l.id)::int leads,COALESCE(SUM(l.proposed_revenue),0)::float proposed_revenue,COALESCE(SUM(l.actual_revenue),0)::float actual_revenue,COUNT(DISTINCT t.id) FILTER(WHERE t.status='COMPLETED')::int completed_tasks,COUNT(DISTINCT t.id) FILTER(WHERE t.due_at<NOW() AND t.status<>'COMPLETED')::int overdue_tasks FROM users u LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN leads l ON l.assigned_to_id=u.id LEFT JOIN tasks t ON t.assigned_to_id=u.id WHERE u.status NOT IN('DISABLED') GROUP BY u.id,d.name ORDER BY proposed_revenue DESC`),this.db.query(`SELECT stage::text label,COUNT(*)::int count,COALESCE(SUM(proposed_revenue),0)::float revenue FROM leads WHERE record_type='LEAD' GROUP BY stage ORDER BY count DESC`)]);return{revenue:rev.rows[0],staff:staff.rows,stages:stages.rows}}

 async sharedFolders(userId:string,admin:boolean){return (await this.db.query(`SELECT f.*,u.first_name,u.last_name,(SELECT COUNT(*)::int FROM shared_files sf WHERE sf.folder_id=f.id) file_count FROM shared_folders f JOIN users u ON u.id=f.created_by_id WHERE $2::boolean OR f.created_by_id=$1 OR (f.publication_status='PUBLISHED' AND (f.visibility='EVERYONE' OR (f.visibility='SELECTED' AND $1=ANY(f.visibility_ids)) OR (f.visibility='DEPARTMENT' AND EXISTS(SELECT 1 FROM users me WHERE me.id=$1 AND me.department_id=ANY(f.visibility_ids))) OR (f.visibility='TEAM' AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.user_id=$1 AND tm.team_id=ANY(f.visibility_ids))) OR (f.visibility='LEAD' AND EXISTS(SELECT 1 FROM leads l WHERE l.id=ANY(f.visibility_ids) AND (l.assigned_to_id=$1 OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.user_id=$1 AND tm.team_id=l.assigned_team_id)))) OR (f.visibility='TASK' AND EXISTS(SELECT 1 FROM tasks t WHERE t.id=ANY(f.visibility_ids) AND (t.assigned_to_id=$1 OR t.created_by_id=$1))))) ORDER BY f.created_at DESC`,[userId,admin])).rows}
 async sharedFolderScopes(userId:string,admin:boolean){
  const [staff,departments,teams,leads,tasks]=await Promise.all([
    this.db.query(`SELECT id,first_name,last_name,job_title FROM users WHERE status='ACTIVE' ORDER BY first_name,last_name`),
    this.db.query(`SELECT id,name FROM departments WHERE is_active=true ORDER BY name`),
    this.db.query(`SELECT id,name FROM teams WHERE is_active=true ORDER BY name`),
    this.db.query(`SELECT l.id,o.name title,l.stage::text subtitle FROM leads l JOIN organizations o ON o.id=l.organization_id WHERE l.record_type='LEAD' AND ($2::boolean OR l.assigned_to_id=$1 OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.user_id=$1 AND tm.team_id=l.assigned_team_id)) ORDER BY o.name LIMIT 300`,[userId,admin]),
    this.db.query(`SELECT id,title,status::text subtitle FROM tasks WHERE $2::boolean OR assigned_to_id=$1 OR created_by_id=$1 ORDER BY updated_at DESC LIMIT 300`,[userId,admin]),
  ]);
  return{staff:staff.rows,departments:departments.rows,teams:teams.rows,leads:leads.rows,tasks:tasks.rows}
 }
 async createSharedFolder(userId:string,admin:boolean,b:any){
  const name=b.name?.trim();
  if(!name)throw new BadRequestException('Folder name is required');
  const visibility=String(b.visibility||'PRIVATE').toUpperCase();
  const allowedVisibilities=['PRIVATE','EVERYONE','SELECTED','DEPARTMENT','TEAM','LEAD','TASK'];
  if(!allowedVisibilities.includes(visibility))throw new BadRequestException('Invalid folder visibility');
  const rawVisibilityIds: unknown[] = Array.isArray(b.visibilityIds)
    ? (b.visibilityIds as unknown[])
    : [];

  const ids: string[] = ['PRIVATE', 'EVERYONE'].includes(visibility)
    ? []
    : Array.from(
        new Set<string>(
          rawVisibilityIds
            .filter(
              (id): id is string =>
                typeof id === 'string' && id.trim().length > 0,
            )
            .map((id) => id.trim()),
        ),
      );
  if(!['PRIVATE','EVERYONE'].includes(visibility)&&!ids.length)throw new BadRequestException('Choose at least one sharing target');

  if(ids.length){
    const scopes=await this.sharedFolderScopes(userId,admin);
    const available:Record<string,Set<string>>={
      SELECTED:new Set(scopes.staff.map((x:any)=>x.id)),
      DEPARTMENT:new Set(scopes.departments.map((x:any)=>x.id)),
      TEAM:new Set(scopes.teams.map((x:any)=>x.id)),
      LEAD:new Set(scopes.leads.map((x:any)=>x.id)),
      TASK:new Set(scopes.tasks.map((x:any)=>x.id)),
    };
    if (ids.some((id) => !available[visibility]?.has(id))) {
      throw new BadRequestException(
        'One or more sharing targets are invalid or unavailable',
      );
    }
  }

  const status=admin?'PUBLISHED':(visibility==='PRIVATE'?'PUBLISHED':'PENDING');
  return (await this.db.query(`INSERT INTO shared_folders(name,description,created_by_id,visibility,visibility_ids,publication_status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[name,b.description?.trim()||null,userId,visibility,ids,status])).rows[0]
 }
 async approveSharedFolder(id:string,userId:string,status:'PUBLISHED'|'REJECTED'){const r=await this.db.query(`UPDATE shared_folders SET publication_status=$2,approved_by_id=CASE WHEN $2='PUBLISHED' THEN $3::uuid ELSE NULL END,approved_at=CASE WHEN $2='PUBLISHED' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,status,userId]);if(!r.rows[0])throw new NotFoundException('Folder not found');return r.rows[0]}
 async sharedFiles(folderId:string,userId:string,admin:boolean){const allowed=await this.sharedFolders(userId,admin);if(!allowed.some((f:any)=>f.id===folderId))throw new NotFoundException('Folder not found');return (await this.db.query(`SELECT sf.*,u.first_name,u.last_name FROM shared_files sf JOIN users u ON u.id=sf.created_by_id WHERE sf.folder_id=$1 ORDER BY sf.created_at DESC`,[folderId])).rows}
 async uploadSharedFile(folderId:string,userId:string,admin:boolean,file:any){if(!file)throw new BadRequestException('File is required');await this.sharedFiles(folderId,userId,admin);const safe=String(file.originalname||'file').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`shared/${folderId}/${randomUUID()}-${safe}`;const up=await this.supabase.admin.storage.from('task-attachments').upload(path,file.buffer,{contentType:file.mimetype,upsert:false});if(up.error)throw new BadRequestException('Upload failed');return (await this.db.query(`INSERT INTO shared_files(folder_id,created_by_id,file_name,mime_type,file_size,storage_path) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[folderId,userId,file.originalname,file.mimetype,file.size,path])).rows[0]}
 async sharedFileDownload(id:string,userId:string,admin:boolean){const r=await this.db.query(`SELECT sf.*,f.id folder_id FROM shared_files sf JOIN shared_folders f ON f.id=sf.folder_id WHERE sf.id=$1`,[id]);const file=r.rows[0];if(!file)throw new NotFoundException('File not found');await this.sharedFiles(file.folder_id,userId,admin);const signed=await this.supabase.admin.storage.from(file.storage_bucket).createSignedUrl(file.storage_path,300);if(signed.error)throw new BadRequestException('Unable to download file');return{url:signed.data.signedUrl,fileName:file.file_name}}

 private async ensureConversation(a:string,b:string){const users=await this.db.query(`SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status NOT IN('DISABLED')`,[[a,b]]);if(users.rows.length!==2)throw new NotFoundException('User not found');const found=await this.db.query(`SELECT * FROM direct_chat_conversations WHERE LEAST(user_a_id,user_b_id)=LEAST($1::uuid,$2::uuid) AND GREATEST(user_a_id,user_b_id)=GREATEST($1::uuid,$2::uuid) LIMIT 1`,[a,b]);if(found.rows[0])return found.rows[0];return (await this.db.query(`INSERT INTO direct_chat_conversations(user_a_id,user_b_id) VALUES($1,$2) RETURNING *`,[a,b])).rows[0]}
}
