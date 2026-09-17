import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export type StaffStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByEmail(email: string) {
    const r = await this.db.query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
    return r.rows[0] ?? null;
  }

  async findByEmailExcludingUser(email: string, userId: string) {
    const r = await this.db.query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1) AND id<>$2 LIMIT 1`, [email, userId]);
    return r.rows[0] ?? null;
  }

  async findById(id: string) {
    const r = await this.db.query(`SELECT * FROM users WHERE id=$1 LIMIT 1`, [id]);
    return r.rows[0] ?? null;
  }

  async listStaff() {
    const r = await this.db.query(`
      SELECT u.id,u.first_name,u.last_name,u.email,u.phone,u.job_title,u.status,u.must_change_password,u.last_login_at,u.created_at,
             r.id AS role_id,r.code AS role_code,r.name AS role_name,
             d.id AS department_id,d.name AS department_name,
             COALESCE((SELECT string_agg(t.name, ', ' ORDER BY t.name) FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=u.id),'') AS team_names
      FROM users u
      JOIN roles r ON r.id=u.role_id
      LEFT JOIN departments d ON d.id=u.department_id
      ORDER BY u.created_at DESC
    `);
    return r.rows;
  }

  async getStaffProfile(id: string) {
    const s = await this.db.query(`
      SELECT u.*,r.code AS role_code,r.name AS role_name,r.description AS role_description,r.is_system_role,
             d.name AS department_name
      FROM users u
      JOIN roles r ON r.id=u.role_id
      LEFT JOIN departments d ON d.id=u.department_id
      WHERE u.id=$1 LIMIT 1
    `,[id]);

    const staff=s.rows[0];
    if(!staff) return null;

    const [teams, overrides, rolePerms, audit, leadLinks, taskLinks, followupLinks, mailLinks, letterLinks, fileLinks] = await Promise.all([
      this.db.query(
        `SELECT t.id,t.name,t.department_id,d.name AS department_name
         FROM team_members tm
         JOIN teams t ON t.id=tm.team_id
         LEFT JOIN departments d ON d.id=t.department_id
         WHERE tm.user_id=$1
         ORDER BY t.name`,
        [id],
      ),

      this.db.query(
        `SELECT upo.permission_id,upo.effect,upo.reason,p.id,p.code,p.name,p.module,p.description
         FROM user_permission_overrides upo
         JOIN permissions p ON p.id=upo.permission_id
         WHERE upo.user_id=$1
         ORDER BY p.module,p.name`,
        [id],
      ),

      this.db.query(
        `SELECT p.id,p.code,p.name,p.module,p.description
         FROM role_permissions rp
         JOIN permissions p ON p.id=rp.permission_id
         WHERE rp.role_id=$1
         ORDER BY p.module,p.name`,
        [staff.role_id],
      ),

      this.db.query(
        `SELECT
           a.*,
           actor.first_name AS actor_first_name,
           actor.last_name AS actor_last_name,
           actor.email AS actor_email,
           target.first_name AS target_first_name,
           target.last_name AS target_last_name,
           target.email AS target_email
         FROM audit_logs a
         LEFT JOIN users actor
           ON actor.id=a.actor_user_id
         LEFT JOIN users target
           ON target.id=a.entity_id
          AND a.entity_type='user'
         WHERE (
           a.entity_type='user'
           AND a.entity_id=$1
         )
         OR a.actor_user_id=$1
         ORDER BY a.created_at DESC
         LIMIT 100`,
        [id],
      ),
      this.db.query(
        `SELECT record_type,COUNT(*)::int AS count
         FROM leads
         WHERE assigned_to_id=$1
         GROUP BY record_type`,
        [id],
      ).catch(()=>({rows:[]} as any)),
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM tasks WHERE assigned_to_id=$1 OR accepted_by_id=$1`,
        [id],
      ).catch(()=>({rows:[{count:0}]} as any)),
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM activities WHERE assigned_to_id=$1`,
        [id],
      ).catch(()=>({rows:[{count:0}]} as any)),
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM crm_mail_threads WHERE created_by_id=$1`,
        [id],
      ).catch(()=>({rows:[{count:0}]} as any)),
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM letter_documents WHERE created_by_id=$1`,
        [id],
      ).catch(()=>({rows:[{count:0}]} as any)),
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM shared_files WHERE created_by_id=$1`,
        [id],
      ).catch(()=>({rows:[{count:0}]} as any)),
    ]);

    const crmCounts=Object.fromEntries(leadLinks.rows.map((row:any)=>[String(row.record_type||'LEAD'),Number(row.count||0)]));

    return {
      ...staff,
      teams:teams.rows,
      permission_overrides:overrides.rows,
      role_permissions:rolePerms.rows,
      audit_events:audit.rows,
      connections:{
        leads:Number(crmCounts.LEAD||0),
        prospects:Number(crmCounts.PROSPECT||0),
        clients:Number(crmCounts.CLIENT||0),
        tasks:Number(taskLinks.rows[0]?.count||0),
        followups:Number(followupLinks.rows[0]?.count||0),
        mail_threads:Number(mailLinks.rows[0]?.count||0),
        letters:Number(letterLinks.rows[0]?.count||0),
        shared_files:Number(fileLinks.rows[0]?.count||0),
      },
    };
  }

  async getRole(roleId:string) {
    const r=await this.db.query(`SELECT id,code,name,description,is_system_role,COALESCE(is_active,TRUE) AS is_active FROM roles WHERE id=$1 LIMIT 1`,[roleId]);
    return r.rows[0]??null;
  }

  async roleExists(roleId:string){
    return Boolean(await this.getRole(roleId));
  }

  async roleAllowedInDepartment(roleId:string, departmentId:string|null){
    const c=await this.db.query(`SELECT COUNT(*)::int AS count FROM role_departments WHERE role_id=$1`,[roleId]);
    if(Number(c.rows[0]?.count??0)===0) return true;
    if(!departmentId) return false;

    const r=await this.db.query(
      `SELECT 1 FROM role_departments WHERE role_id=$1 AND department_id=$2 LIMIT 1`,
      [roleId,departmentId],
    );

    return r.rowCount===1;
  }

  async departmentExists(id:string){
    const r=await this.db.query(`SELECT 1 FROM departments WHERE id=$1 LIMIT 1`,[id]);
    return r.rowCount===1;
  }

  async teamsExist(ids:string[]){
    if(!ids.length) return true;

    const r=await this.db.query(`SELECT id FROM teams WHERE id=ANY($1::uuid[])`,[ids]);
    return r.rows.length===new Set(ids).size;
  }

  async teamsBelongToDepartment(ids:string[], departmentId:string|null){
    if(!ids.length) return true;
    if(!departmentId) return false;

    const r=await this.db.query(
      `SELECT id FROM teams WHERE id=ANY($1::uuid[]) AND department_id=$2`,
      [ids,departmentId],
    );

    return r.rows.length===new Set(ids).size;
  }

  async permissionsExist(ids:string[]){
    if(!ids.length) return true;

    const r=await this.db.query(`SELECT id FROM permissions WHERE id=ANY($1::uuid[])`,[ids]);
    return r.rows.length===new Set(ids).size;
  }

  async directMessageTargetsExist(ids:string[]){
    if(!ids.length) return true;
    const r=await this.db.query(`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=ANY($1::uuid[]) AND u.status='ACTIVE' AND r.code<>'SUPER_ADMIN'`,[ids]);
    return r.rows.length===new Set(ids).size;
  }

  async getDirectMessageAccess(userId:string){
    const options=await this.db.query(`
      SELECT u.id,u.first_name,u.last_name,u.email,u.job_title,r.name AS role_name,r.code AS role_code,d.name AS department_name,
             EXISTS(SELECT 1 FROM staff_direct_message_grants g WHERE g.staff_user_id=$1 AND g.allowed_user_id=u.id) AS granted
      FROM users u
      JOIN roles r ON r.id=u.role_id
      LEFT JOIN departments d ON d.id=u.department_id
      WHERE u.id<>$1 AND u.status='ACTIVE' AND r.code<>'SUPER_ADMIN'
      ORDER BY d.name NULLS LAST,u.first_name,u.last_name
    `,[userId]);
    return {
      userId,
      selectedUserIds: options.rows.filter((row:any)=>row.granted).map((row:any)=>row.id),
      options: options.rows,
    };
  }

  async replaceDirectMessageAccess(userId:string,userIds:string[],grantedById?:string){
    const client=await this.db.getClient();
    try{
      await client.query('BEGIN');
      await client.query(`DELETE FROM staff_direct_message_grants WHERE staff_user_id=$1`,[userId]);
      for(const allowedId of userIds){
        await client.query(`INSERT INTO staff_direct_message_grants(staff_user_id,allowed_user_id,granted_by_id) VALUES($1,$2,$3) ON CONFLICT(staff_user_id,allowed_user_id) DO UPDATE SET granted_by_id=EXCLUDED.granted_by_id,updated_at=NOW()`,[userId,allowedId,grantedById??null]);
      }
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }

  async createStaff(p:any){
    const r=await this.db.query(`
      INSERT INTO users(auth_user_id,first_name,last_name,email,phone,job_title,role_id,department_id,status,must_change_password,created_by_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'INVITED',TRUE,$9)
      RETURNING *
    `,[p.authUserId,p.firstName,p.lastName,p.email,p.phone??null,p.jobTitle??null,p.roleId,p.departmentId??null,p.createdById??null]);

    return r.rows[0];
  }

  async updateStaff(id:string,p:any){
    const r=await this.db.query(`
      UPDATE users
      SET first_name=$2,last_name=$3,email=$4,phone=$5,job_title=$6,role_id=$7,department_id=$8,updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `,[id,p.firstName,p.lastName,p.email,p.phone,p.jobTitle,p.roleId,p.departmentId]);

    return r.rows[0]??null;
  }

  async addTeamMemberships(userId:string,ids:string[]){
    for(const teamId of ids) {
      await this.db.query(
        `INSERT INTO team_members(team_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [teamId,userId],
      );
    }
  }

  async replaceTeamMemberships(userId:string,ids:string[]){
    await this.db.query(`DELETE FROM team_members WHERE user_id=$1`,[userId]);
    await this.addTeamMemberships(userId,ids);
  }

  async addPermissionOverrides(userId:string,items:any[],grantedById?:string){
    for(const o of items) {
      await this.db.query(`
        INSERT INTO user_permission_overrides(user_id,permission_id,effect,reason,granted_by_id)
        VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,permission_id)
        DO UPDATE SET
          effect=EXCLUDED.effect,
          reason=EXCLUDED.reason,
          granted_by_id=EXCLUDED.granted_by_id,
          updated_at=NOW()
      `,[userId,o.permissionId,o.effect,o.reason??null,grantedById??null]);
    }
  }

  async replacePermissionOverrides(userId:string,items:any[],grantedById?:string){
    await this.db.query(`DELETE FROM user_permission_overrides WHERE user_id=$1`,[userId]);
    await this.addPermissionOverrides(userId,items,grantedById);
  }

  async setStatus(id:string,status:StaffStatus){
    const r=await this.db.query(
      `UPDATE users SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id,status],
    );
    return r.rows[0]??null;
  }

  async markPasswordResetRequired(id:string){
    await this.db.query(
      `UPDATE users SET must_change_password=TRUE,password_changed_at=NULL,updated_at=NOW() WHERE id=$1`,
      [id],
    );
  }

  async countEnabledSuperAdmins(){
    const r=await this.db.query(
      `SELECT COUNT(*)::int AS count
       FROM users u
       JOIN roles r ON r.id=u.role_id
       WHERE r.code='SUPER_ADMIN'
         AND u.status NOT IN('SUSPENDED','DISABLED')`,
    );

    return Number(r.rows[0]?.count??0);
  }

  async isActiveStaff(id:string){
    const r=await this.db.query(`SELECT 1 FROM users WHERE id=$1 AND status='ACTIVE' LIMIT 1`,[id]);
    return r.rowCount===1;
  }

  async getStaffDeletionDependencies(id:string){
    const r=await this.db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM leads WHERE assigned_to_id=$1) AS leads,
        (SELECT COUNT(*)::int FROM tasks WHERE assigned_to_id=$1) AS tasks,
        (SELECT COUNT(*)::int FROM activities WHERE assigned_to_id=$1) AS followups,
        (SELECT COUNT(*)::int FROM lead_assignment_batches WHERE assigned_to_id=$1) AS assignment_batches,
        (SELECT COUNT(*)::int FROM organizations WHERE assigned_owner_id=$1) AS organizations,
        (SELECT COUNT(*)::int FROM crm_mail_threads WHERE created_by_id=$1) AS mail_threads,
        (SELECT COUNT(*)::int FROM letter_documents WHERE created_by_id=$1 OR updated_by_id=$1) AS letters,
        (SELECT COUNT(*)::int FROM shared_files WHERE created_by_id=$1) AS shared_files,
        (SELECT COUNT(*)::int FROM shared_folders WHERE created_by_id=$1) AS shared_folders,
        (SELECT COUNT(*)::int FROM crm_mail_drafts WHERE created_by_id=$1) AS mail_drafts
    `,[id]);
    return r.rows[0]??{};
  }

  async deleteStaffUser(id:string,reassignToId:string|null){
    const client=await this.db.getClient();
    try{
      await client.query('BEGIN');
      if(reassignToId){
        await client.query(`UPDATE leads SET assigned_to_id=$2,updated_at=NOW() WHERE assigned_to_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE tasks SET assigned_to_id=$2,updated_at=NOW() WHERE assigned_to_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE activities SET assigned_to_id=$2,updated_at=NOW() WHERE assigned_to_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE lead_assignment_batches SET assigned_to_id=$2,updated_at=NOW() WHERE assigned_to_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE organizations SET assigned_owner_id=$2,updated_at=NOW() WHERE assigned_owner_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE crm_mail_threads SET created_by_id=$2,updated_at=NOW() WHERE created_by_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE letter_documents SET created_by_id=CASE WHEN created_by_id=$1 THEN $2 ELSE created_by_id END,updated_by_id=CASE WHEN updated_by_id=$1 THEN $2 ELSE updated_by_id END,updated_at=NOW() WHERE created_by_id=$1 OR updated_by_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE shared_files SET created_by_id=$2 WHERE created_by_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE shared_folders SET created_by_id=$2,updated_at=NOW() WHERE created_by_id=$1`,[id,reassignToId]);
        await client.query(`UPDATE crm_mail_drafts SET created_by_id=$2,updated_at=NOW() WHERE created_by_id=$1`,[id,reassignToId]);
      }
      await client.query(`UPDATE users SET created_by_id=NULL WHERE created_by_id=$1`,[id]);
      await client.query(`UPDATE teams SET manager_id=NULL WHERE manager_id=$1`,[id]);
      await client.query(`UPDATE user_permission_overrides SET granted_by_id=NULL WHERE granted_by_id=$1`,[id]);
      await client.query(`DELETE FROM users WHERE id=$1`,[id]);
      await client.query('COMMIT');
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{
      client.release();
    }
  }

  async deleteInternalUser(id:string){
    await this.db.query(`DELETE FROM users WHERE id=$1`,[id]);
  }

  async deleteInvitedUser(id:string){
    const client=await this.db.getClient();
    try{
      await client.query('BEGIN');
      await client.query(`UPDATE users SET created_by_id=NULL WHERE created_by_id=$1`,[id]);
      await client.query(`UPDATE teams SET manager_id=NULL WHERE manager_id=$1`,[id]);
      await client.query(`UPDATE user_permission_overrides SET granted_by_id=NULL WHERE granted_by_id=$1`,[id]);
      await client.query(`DELETE FROM lead_assignment_batches WHERE assigned_to_id=$1`,[id]);
      await client.query(`UPDATE leads
        SET stage=CASE WHEN assigned_to_id=$1 AND assigned_team_id IS NULL AND stage='ASSIGNED' THEN 'NEW' ELSE stage END,
            updated_at=NOW()
        WHERE assigned_to_id=$1`,[id]);
      await client.query(`DELETE FROM users WHERE id=$1`,[id]);
      await client.query('COMMIT');
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{
      client.release();
    }
  }
}
