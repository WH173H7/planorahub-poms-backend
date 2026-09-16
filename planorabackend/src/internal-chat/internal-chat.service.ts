import {BadRequestException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service.js';
import {AuditService} from '../audit/audit.service.js';
import {SupabaseService} from '../supabase/supabase.service.js';

type Ctx={actorUserId?:string;ipAddress?:string;userAgent?:string};
type ChannelType='COMPANY'|'DEPARTMENT'|'TEAM'|'CUSTOM'|'ADMIN';

@Injectable()
export class InternalChatService{
  constructor(private readonly db:DatabaseService,private readonly audit:AuditService,private readonly supabase:SupabaseService){}

  async channels(userId:string,roleCode:string){
    await this.syncStructureChannels();
    const admin=roleCode==='SUPER_ADMIN';
    const result=await this.db.query(`
      SELECT c.*,
        CASE
          WHEN c.channel_type='COMPANY' THEN (SELECT COUNT(*)::int FROM users x WHERE x.status='ACTIVE')
          WHEN c.channel_type='DEPARTMENT' THEN (SELECT COUNT(*)::int FROM users x WHERE x.status='ACTIVE' AND x.department_id=c.department_id)
          WHEN c.channel_type='TEAM' THEN (SELECT COUNT(*)::int FROM team_members tm JOIN users x ON x.id=tm.user_id WHERE tm.team_id=c.team_id AND x.status='ACTIVE')
          WHEN c.channel_type='ADMIN' THEN (SELECT COUNT(*)::int FROM users x JOIN roles rr ON rr.id=x.role_id WHERE x.status='ACTIVE' AND rr.code='SUPER_ADMIN')
          ELSE (SELECT COUNT(*)::int FROM users x WHERE x.status='ACTIVE')
        END member_count,
        COALESCE((SELECT COUNT(*)::int FROM internal_chat_messages m
          WHERE m.channel_id=c.id AND m.deleted_at IS NULL AND m.sender_user_id<>$1
          AND m.created_at>COALESCE((SELECT cr.last_read_at FROM internal_chat_channel_reads cr WHERE cr.channel_id=c.id AND cr.user_id=$1),'1970-01-01'::timestamptz)),0) unread_count,
        (SELECT m.body FROM internal_chat_messages m WHERE m.channel_id=c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) last_message,
        (SELECT m.created_at FROM internal_chat_messages m WHERE m.channel_id=c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) last_message_at
      FROM internal_chat_channels c
      LEFT JOIN users me ON me.id=$1
      WHERE c.is_active=TRUE AND (
        $2::boolean
        OR c.channel_type='COMPANY'
        OR (c.channel_type='CUSTOM' AND c.visibility='ALL_STAFF')
        OR (c.channel_type='DEPARTMENT' AND c.department_id=me.department_id)
        OR (c.channel_type='TEAM' AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=c.team_id AND tm.user_id=$1))
      )
      ORDER BY COALESCE((SELECT MAX(m.created_at) FROM internal_chat_messages m WHERE m.channel_id=c.id),c.updated_at,c.created_at) DESC,
        CASE c.channel_type WHEN 'COMPANY' THEN 0 WHEN 'TEAM' THEN 1 WHEN 'DEPARTMENT' THEN 2 ELSE 3 END,
        c.name
    `,[userId,admin]);
    return result.rows;
  }

  async createChannel(body:{name?:string;description?:string;visibility?:string},ctx?:Ctx){
    const name=body.name?.trim();
    if(!name)throw new BadRequestException('Channel name is required');
    const visibility=body.visibility==='ADMIN_ONLY'?'ADMIN_ONLY':'ALL_STAFF';
    const channelType:ChannelType=visibility==='ADMIN_ONLY'?'ADMIN':'CUSTOM';
    try{
      const row=(await this.db.query(`INSERT INTO internal_chat_channels(name,description,visibility,channel_type,created_by_id,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) RETURNING *`,[name,body.description?.trim()||null,visibility,channelType,ctx?.actorUserId??null])).rows[0];
      await this.audit.log({actorUserId:ctx?.actorUserId,action:'CHAT_CHANNEL_CREATED',module:'communications',entityType:'chat_channel',entityId:String(row.id),newValues:row,ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
      return row;
    }catch(error:any){if(error?.code==='23505')throw new BadRequestException('A channel with this name already exists');throw error}
  }

  async messages(channelId:string,userId:string,roleCode:string,before?:string){
    await this.ensureAccess(channelId,userId,roleCode);
    const result=await this.db.query(`
      SELECT m.*,u.first_name,u.last_name,u.job_title,
        ru.first_name reply_first_name,ru.last_name reply_last_name,rm.body reply_body,
        COALESCE(json_agg(json_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'file_size',a.file_size)) FILTER(WHERE a.id IS NOT NULL),'[]') attachments
      FROM internal_chat_messages m
      LEFT JOIN users u ON u.id=m.sender_user_id
      LEFT JOIN internal_chat_messages rm ON rm.id=m.reply_to_id
      LEFT JOIN users ru ON ru.id=rm.sender_user_id
      LEFT JOIN internal_chat_attachments a ON a.message_id=m.id
      WHERE m.channel_id=$1 AND ($2::timestamptz IS NULL OR m.created_at<$2::timestamptz)
      GROUP BY m.id,u.first_name,u.last_name,u.job_title,ru.first_name,ru.last_name,rm.body
      ORDER BY m.created_at DESC LIMIT 100
    `,[channelId,before||null]);
    await this.db.query(`INSERT INTO internal_chat_channel_reads(channel_id,user_id,last_read_at) VALUES($1,$2,NOW()) ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_at=EXCLUDED.last_read_at`,[channelId,userId]);
    return result.rows.reverse();
  }

  async send(channelId:string,body:string,userId:string,roleCode:string,replyToId?:string|null,ctx?:Ctx){
    await this.ensureAccess(channelId,userId,roleCode);
    const text=body?.trim();
    if(!text)throw new BadRequestException('Message cannot be empty');
    if(text.length>6000)throw new BadRequestException('Message is too long');
    if(replyToId){const reply=await this.db.query(`SELECT 1 FROM internal_chat_messages WHERE id=$1 AND channel_id=$2`,[replyToId,channelId]);if(!reply.rowCount)throw new BadRequestException('Reply target is no longer available')}
    const row=(await this.db.query(`INSERT INTO internal_chat_messages(channel_id,sender_user_id,body,reply_to_id) VALUES($1,$2,$3,$4) RETURNING *`,[channelId,userId,text,replyToId||null])).rows[0];
    await this.db.query(`UPDATE internal_chat_channels SET updated_at=NOW() WHERE id=$1`,[channelId]);
    await this.db.query(`INSERT INTO internal_chat_channel_reads(channel_id,user_id,last_read_at) VALUES($1,$2,NOW()) ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_at=EXCLUDED.last_read_at`,[channelId,userId]);
    await this.audit.log({actorUserId:userId,action:'CHAT_MESSAGE_SENT',module:'communications',entityType:'chat_message',entityId:String(row.id),newValues:{channelId,replyToId:replyToId||null},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return row;
  }

  async upload(channelId:string,file:any,userId:string,roleCode:string,ctx?:Ctx){
    await this.ensureAccess(channelId,userId,roleCode);
    if(!file)throw new BadRequestException('File is required');
    if(file.size>10*1024*1024)throw new BadRequestException('Attachment must be 10 MB or smaller');
    const safe=String(file.originalname||'attachment').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`group-chat/${channelId}/${randomUUID()}-${safe}`;
    const uploaded=await this.supabase.admin.storage.from('task-attachments').upload(path,file.buffer,{contentType:file.mimetype,upsert:false});
    if(uploaded.error)throw new BadRequestException('Attachment upload failed');
    const message=(await this.db.query(`INSERT INTO internal_chat_messages(channel_id,sender_user_id,body) VALUES($1,$2,$3) RETURNING *`,[channelId,userId,`Shared ${file.originalname}`])).rows[0];
    await this.db.query(`INSERT INTO internal_chat_attachments(message_id,file_name,mime_type,file_size,storage_path) VALUES($1,$2,$3,$4,$5)`,[message.id,file.originalname,file.mimetype,file.size,path]);
    await this.db.query(`UPDATE internal_chat_channels SET updated_at=NOW() WHERE id=$1`,[channelId]);
    await this.audit.log({actorUserId:userId,action:'CHAT_ATTACHMENT_SENT',module:'communications',entityType:'chat_message',entityId:String(message.id),newValues:{channelId,fileName:file.originalname,fileSize:file.size},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return message;
  }

  async attachment(id:string,userId:string,roleCode:string,ctx?:Ctx){
    const row=(await this.db.query(`SELECT a.*,m.channel_id FROM internal_chat_attachments a JOIN internal_chat_messages m ON m.id=a.message_id WHERE a.id=$1`,[id])).rows[0];
    if(!row)throw new NotFoundException('Attachment not found');
    await this.ensureAccess(row.channel_id,userId,roleCode);
    const signed=await this.supabase.admin.storage.from(row.storage_bucket).createSignedUrl(row.storage_path,300);
    if(signed.error)throw new BadRequestException('Unable to open attachment');
    await this.audit.log({actorUserId:userId,action:'CHAT_ATTACHMENT_OPENED',module:'communications',entityType:'chat_attachment',entityId:id,newValues:{channelId:row.channel_id,fileName:row.file_name},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return{url:signed.data.signedUrl,fileName:row.file_name,mimeType:row.mime_type};
  }

  async edit(id:string,body:string,userId:string,ctx?:Ctx){
    const text=body?.trim();if(!text)throw new BadRequestException('Message cannot be empty');
    const row=(await this.db.query(`UPDATE internal_chat_messages SET body=$3,edited_at=NOW() WHERE id=$1 AND sender_user_id=$2 AND deleted_at IS NULL RETURNING *`,[id,userId,text])).rows[0];
    if(!row)throw new NotFoundException('Message not found');
    await this.audit.log({actorUserId:userId,action:'CHAT_MESSAGE_EDITED',module:'communications',entityType:'chat_message',entityId:id,newValues:{edited:true},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return row;
  }

  async remove(id:string,userId:string,roleCode:string,ctx?:Ctx){
    const admin=roleCode==='SUPER_ADMIN';
    const row=(await this.db.query(`UPDATE internal_chat_messages SET body='',deleted_at=NOW(),edited_at=NOW() WHERE id=$1 AND (sender_user_id=$2 OR $3::boolean) RETURNING *`,[id,userId,admin])).rows[0];
    if(!row)throw new NotFoundException('Message not found');
    await this.audit.log({actorUserId:userId,action:'CHAT_MESSAGE_DELETED',module:'communications',entityType:'chat_message',entityId:id,oldValues:{channelId:row.channel_id,senderUserId:row.sender_user_id},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return true;
  }

  private async syncStructureChannels(){
    await this.db.query(`INSERT INTO internal_chat_channels(name,description,visibility,channel_type,department_id,updated_at) SELECT 'Department · '||d.name,'Department group chat for '||d.name||'.','ALL_STAFF','DEPARTMENT',d.id,NOW() FROM departments d WHERE d.is_active=TRUE AND NOT EXISTS(SELECT 1 FROM internal_chat_channels c WHERE c.channel_type='DEPARTMENT' AND c.department_id=d.id) ON CONFLICT DO NOTHING`);
    await this.db.query(`INSERT INTO internal_chat_channels(name,description,visibility,channel_type,team_id,updated_at) SELECT 'Team · '||t.name,'Team group chat for '||t.name||'.','ALL_STAFF','TEAM',t.id,NOW() FROM teams t WHERE t.is_active=TRUE AND NOT EXISTS(SELECT 1 FROM internal_chat_channels c WHERE c.channel_type='TEAM' AND c.team_id=t.id) ON CONFLICT DO NOTHING`);
  }

  private async ensureAccess(id:string,userId:string,roleCode:string){
    const admin=roleCode==='SUPER_ADMIN';
    const result=await this.db.query(`SELECT c.* FROM internal_chat_channels c LEFT JOIN users me ON me.id=$2 WHERE c.id=$1 AND c.is_active=TRUE AND ($3::boolean OR c.channel_type='COMPANY' OR (c.channel_type='CUSTOM' AND c.visibility='ALL_STAFF') OR (c.channel_type='DEPARTMENT' AND c.department_id=me.department_id) OR (c.channel_type='TEAM' AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=c.team_id AND tm.user_id=$2))) LIMIT 1`,[id,userId,admin]);
    if(!result.rows[0])throw new NotFoundException('Chat channel not found');
    return result.rows[0];
  }
}
