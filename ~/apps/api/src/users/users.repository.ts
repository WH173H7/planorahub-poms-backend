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
             d.id AS department_id,d.name AS department_name
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

    const [teams, overrides, rolePerms, audit] = await Promise.all([
      this.db.query(
        `SELECT t.id,t.name,t.department_id,d.name AS department_name
         FROM team_members tm
         JOIN teams t ON t.id=tm.team_id
         JOIN departments d ON d.id=t.department_id
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
    ]);

    return {
      ...staff,
      teams:teams.rows,
      permission_overrides:overrides.rows,
      role_permissions:rolePerms.rows,
      audit_events:audit.rows,
    };
  }

  async getRole(roleId:string) {
    const r=await this.db.query(`SELECT id,code,name FROM roles WHERE id=$1 LIMIT 1`,[roleId]);
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

  async deleteInternalUser(id:string){
    await this.db.query(`DELETE FROM users WHERE id=$1`,[id]);
  }
}
