import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { type StaffStatus, UsersRepository } from './users.repository.js';
import { StaffMailService } from '../mailer/staff-mail.service.js';

type Ctx={actorUserId?:string;ipAddress?:string;userAgent?:string};
type Override={permissionId:string;effect:'ALLOW'|'DENY';reason?:string};
export type UpdateStaffInput={
  firstName?:string;lastName?:string;email?:string;phone?:string|null;jobTitle?:string|null;
  roleId?:string;departmentId?:string|null;teamIds?:string[];permissionOverrides?:Override[];directMessageUserIds?:string[];
};

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository:UsersRepository,private readonly supabase:SupabaseService,private readonly audit:AuditService,private readonly mail:StaffMailService){}

  listStaff(){ return this.usersRepository.listStaff(); }

  async getStaff(id:string){
    const s=await this.usersRepository.getStaffProfile(id);
    if(!s) throw new NotFoundException('Staff member not found');
    return s;
  }

  async createStaff(dto:CreateStaffDto,ctx?:Ctx){
    const email=dto.email.trim().toLowerCase();
    if(await this.usersRepository.findByEmail(email)) throw new ConflictException('A staff account with this email already exists');
    const selectedRole=await this.usersRepository.getRole(dto.roleId);
    if(!selectedRole) throw new BadRequestException('Invalid role');
    if(selectedRole.code==='SUPER_ADMIN') throw new BadRequestException('Super Admin cannot be assigned through the staff creation flow');
    if(selectedRole.is_active===false) throw new BadRequestException('This role is archived and cannot be assigned to new staff');
    const departmentId=dto.departmentId??null;
    if(!departmentId) throw new BadRequestException('Create/select a department before creating staff');
    if(!(await this.usersRepository.departmentExists(departmentId))) throw new BadRequestException('Invalid department');
    if(!(await this.usersRepository.roleAllowedInDepartment(dto.roleId,departmentId))) throw new BadRequestException('This role is not available in the selected department');
    const teamIds=[...new Set(dto.teamIds??[])];
    if(!(await this.usersRepository.teamsExist(teamIds))) throw new BadRequestException('One or more teams are invalid');
    const permissionOverrides=dto.permissionOverrides??[];
    await this.validateOverrides(permissionOverrides);
    const directMessageUserIds=[...new Set(dto.directMessageUserIds??[])];
    await this.validateDirectMessageTargets(directMessageUserIds);
    const temporaryPassword=this.generateTemporaryPassword();
    const {data,error}=await this.supabase.admin.auth.admin.createUser({
      email,password:temporaryPassword,email_confirm:true,
      user_metadata:{first_name:dto.firstName.trim(),last_name:dto.lastName.trim(),must_change_password:true},
    });
    if(error||!data.user) throw new BadRequestException(this.authAdminError(error?.message));
    let staff:any;
    try{
      staff=await this.usersRepository.createStaff({
        authUserId:data.user.id,firstName:dto.firstName.trim(),lastName:dto.lastName.trim(),email,
        phone:dto.phone?.trim(),jobTitle:dto.jobTitle?.trim(),roleId:dto.roleId,departmentId:departmentId??undefined,createdById:ctx?.actorUserId,
      });
      await this.usersRepository.addTeamMemberships(staff.id,teamIds);
      await this.usersRepository.addPermissionOverrides(staff.id,permissionOverrides,ctx?.actorUserId);
      await this.usersRepository.replaceDirectMessageAccess(staff.id,directMessageUserIds,ctx?.actorUserId);
      await this.audit.log({actorUserId:ctx?.actorUserId,action:'STAFF_CREATED',module:'users',entityType:'user',entityId:staff.id,
        newValues:{firstName:staff.first_name,lastName:staff.last_name,email:staff.email,roleId:staff.role_id,departmentId:staff.department_id,teamIds,permissionOverrides,directMessageUserIds},
        ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
      const profile:any=await this.getStaff(staff.id);
      const emailDelivery=await this.mail.sendWelcome({
        firstName:profile.first_name,
        lastName:profile.last_name,
        email:profile.email,
        temporaryPassword,
        roleName:profile.role_name,
        departmentName:profile.department_name,
        teamNames:(profile.teams??[]).map((team:any)=>team.name),
      });
      return {staff:profile,temporaryPassword,emailDelivery};
    }catch{
      await this.supabase.admin.auth.admin.deleteUser(data.user.id);
      if(staff?.id) await this.usersRepository.deleteInternalUser(staff.id).catch(()=>undefined);
      throw new InternalServerErrorException('Staff creation could not be completed');
    }
  }

  async updateStaff(id:string,input:UpdateStaffInput,ctx?:Ctx){
    const current=await this.requireStaff(id);
    const roleId=input.roleId??current.role_id;
    const role=await this.usersRepository.getRole(roleId);
    if(!role) throw new BadRequestException('Invalid role');
    if(input.roleId && role.id!==current.role_id && role.is_active===false) throw new BadRequestException('This role is archived and cannot be newly assigned');
    if(input.roleId && role.code==='SUPER_ADMIN' && current.role_id!==role.id) throw new BadRequestException('Super Admin cannot be assigned through the staff editor');
    const departmentId=input.departmentId===undefined?current.department_id:input.departmentId;
    if(departmentId && !(await this.usersRepository.departmentExists(departmentId))) throw new BadRequestException('Invalid department');
    if(!(await this.usersRepository.roleAllowedInDepartment(roleId,departmentId))) throw new BadRequestException('This role is not available in the selected department');
    const teamIds=input.teamIds===undefined?undefined:[...new Set(input.teamIds)];
    if(teamIds && !(await this.usersRepository.teamsExist(teamIds))) throw new BadRequestException('One or more teams are invalid');
    if(input.permissionOverrides) await this.validateOverrides(input.permissionOverrides);
    if(input.directMessageUserIds) await this.validateDirectMessageTargets([...new Set(input.directMessageUserIds)]);
    const beforeProfile=(teamIds!==undefined||input.permissionOverrides!==undefined)?await this.usersRepository.getStaffProfile(id):null;
    const beforeDirect=input.directMessageUserIds!==undefined?await this.usersRepository.getDirectMessageAccess(id):null;
    const oldRole=await this.usersRepository.getRole(current.role_id);
    if(oldRole?.code==='SUPER_ADMIN' && role.code!=='SUPER_ADMIN') await this.protectLastSuperAdmin();

    const email=input.email?.trim().toLowerCase()??current.email;
    if(await this.usersRepository.findByEmailExcludingUser(email,id)) throw new ConflictException('A staff account with this email already exists');
    const firstName=input.firstName?.trim()??current.first_name;
    const lastName=input.lastName?.trim()??current.last_name;
    if(!firstName||!lastName||!email) throw new BadRequestException('First name, last name and email are required');

    if(current.auth_user_id){
      const attrs:any={user_metadata:{first_name:firstName,last_name:lastName}};
      if(email!==current.email){attrs.email=email;attrs.email_confirm=true;}
      const {error}=await this.supabase.admin.auth.admin.updateUserById(current.auth_user_id,attrs);
      if(error) throw new BadRequestException(this.authAdminError(error.message));
    }

    const updated=await this.usersRepository.updateStaff(id,{
      firstName,lastName,email,
      phone:input.phone===undefined?current.phone:this.clean(input.phone),
      jobTitle:input.jobTitle===undefined?current.job_title:this.clean(input.jobTitle),
      roleId,departmentId,
    });
    if(teamIds) await this.usersRepository.replaceTeamMemberships(id,teamIds);
    if(input.permissionOverrides) await this.usersRepository.replacePermissionOverrides(id,input.permissionOverrides,ctx?.actorUserId);
    if(input.directMessageUserIds) await this.usersRepository.replaceDirectMessageAccess(id,[...new Set(input.directMessageUserIds)],ctx?.actorUserId);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'STAFF_UPDATED',module:'users',entityType:'user',entityId:id,
      oldValues:{firstName:current.first_name,lastName:current.last_name,email:current.email,roleId:current.role_id,departmentId:current.department_id,...(teamIds!==undefined?{teamIds:(beforeProfile?.teams??[]).map((team:any)=>team.id)}:{}),...(input.permissionOverrides!==undefined?{permissionOverrides:(beforeProfile?.permission_overrides??[]).map((item:any)=>({permissionId:item.permission_id,effect:item.effect,reason:item.reason}))}:{}),...(input.directMessageUserIds!==undefined?{directMessageUserIds:beforeDirect?.selectedUserIds??[]}:{})},
      newValues:{firstName:updated.first_name,lastName:updated.last_name,email:updated.email,roleId:updated.role_id,departmentId:updated.department_id,...(teamIds!==undefined?{teamIds}:{}),...(input.permissionOverrides!==undefined?{permissionOverrides:input.permissionOverrides}:{}),...(input.directMessageUserIds!==undefined?{directMessageUserIds:input.directMessageUserIds}:{})},
      ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return this.getStaff(id);
  }

  async setStaffStatus(id:string,status:Extract<StaffStatus,'ACTIVE'|'SUSPENDED'|'DISABLED'>,ctx?:Ctx){
    const current=await this.requireStaff(id);
    const role=await this.usersRepository.getRole(current.role_id);
    if(role?.code==='SUPER_ADMIN' && status!=='ACTIVE') await this.protectLastSuperAdmin();
    if(current.auth_user_id){
      const {error}=await this.supabase.admin.auth.admin.updateUserById(current.auth_user_id,{ban_duration:status==='ACTIVE'?'none':'876000h'});
      if(error) throw new BadRequestException(this.authAdminError(error.message));
    }
    await this.usersRepository.setStatus(id,status);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:status==='ACTIVE'?'STAFF_REACTIVATED':status==='SUSPENDED'?'STAFF_SUSPENDED':'STAFF_DISABLED',
      module:'users',entityType:'user',entityId:id,oldValues:{status:current.status},newValues:{status},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return this.getStaff(id);
  }

  async deleteStaff(id:string,reassignToId:string|null,ctx?:Ctx){
    const current=await this.requireStaff(id);
    if(ctx?.actorUserId===id) throw new BadRequestException('You cannot delete the account you are currently signed in with.');

    const role=await this.usersRepository.getRole(current.role_id);
    if(role?.code==='SUPER_ADMIN') await this.protectLastSuperAdmin();

    const dependencies=await this.usersRepository.getStaffDeletionDependencies(id);
    const linkedWork=Object.values(dependencies).some((value)=>Number(value)>0);
    let replacementId=reassignToId?.trim()||null;

    if(linkedWork && !replacementId){
      throw new BadRequestException('This staff member still owns CRM work. Select an active staff member to receive their linked work before deletion.');
    }
    if(replacementId){
      if(replacementId===id) throw new BadRequestException('Select a different staff member for reassignment.');
      if(!(await this.usersRepository.isActiveStaff(replacementId))) throw new BadRequestException('The reassignment staff member must be an active account.');
    }

    if(current.auth_user_id){
      const {error}=await this.supabase.admin.auth.admin.deleteUser(current.auth_user_id);
      if(error) throw new BadRequestException(this.authAdminError(error.message));
    }

    await this.usersRepository.deleteStaffUser(id,replacementId);
    await this.audit.log({
      actorUserId:ctx?.actorUserId,
      action:'STAFF_DELETED',
      module:'users',
      entityType:'user',
      entityId:id,
      oldValues:{firstName:current.first_name,lastName:current.last_name,email:current.email,status:current.status,dependencies},
      newValues:{reassignedToId:replacementId},
      ipAddress:ctx?.ipAddress,
      userAgent:ctx?.userAgent,
    });
    return {id,reassignedToId:replacementId};
  }

  async resetPassword(id:string,sendEmail:boolean,ctx?:Ctx){
    const staff=await this.requireStaff(id);
    if(!staff.auth_user_id) throw new BadRequestException('This staff account has no authentication account');
    const temporaryPassword=this.generateTemporaryPassword();
    const {error}=await this.supabase.admin.auth.admin.updateUserById(staff.auth_user_id,{password:temporaryPassword,user_metadata:{must_change_password:true}});
    if(error) throw new BadRequestException(this.authAdminError(error.message));
    await this.usersRepository.markPasswordResetRequired(id);
    const profile:any=await this.getStaff(id);
    const emailDelivery=sendEmail
      ? await this.mail.sendPasswordReset({
          firstName:profile.first_name,
          lastName:profile.last_name,
          email:profile.email,
          temporaryPassword,
          roleName:profile.role_name,
          departmentName:profile.department_name,
          teamNames:(profile.teams??[]).map((team:any)=>team.name),
        })
      : {status:'SKIPPED' as const,message:'Admin chose not to email this temporary password.'};
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'STAFF_PASSWORD_RESET',module:'users',entityType:'user',entityId:id,newValues:{mustChangePassword:true,emailRequested:sendEmail,emailStatus:emailDelivery.status},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return {temporaryPassword,emailDelivery};
  }


  private authAdminError(message?:string){
    const raw=(message||'Unable to create authentication account').trim();
    if(/invalid api key/i.test(raw)) return 'Production Supabase admin credentials were rejected. Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend deployment belong to the same Supabase project and contain no surrounding quotes.';
    if(/jwt|service.?role|unauthorized|forbidden/i.test(raw)) return `Supabase admin authentication failed: ${raw}`;
    return raw;
  }
  private async requireStaff(id:string){const s=await this.usersRepository.findById(id);if(!s) throw new NotFoundException('Staff member not found');return s;}
  private async protectLastSuperAdmin(){if((await this.usersRepository.countEnabledSuperAdmins())<=1) throw new BadRequestException('The last enabled Super Admin cannot be suspended, disabled or moved to another role');}
  async getDirectMessageAccess(id:string){
    await this.requireStaff(id);
    return this.usersRepository.getDirectMessageAccess(id);
  }

  async setDirectMessageAccess(id:string,userIds:string[],ctx?:Ctx){
    await this.requireStaff(id);
    const before=await this.usersRepository.getDirectMessageAccess(id);
    const unique=[...new Set(userIds??[])];
    if(unique.includes(id)) throw new BadRequestException('A staff member cannot be granted direct-message access to themselves');
    await this.validateDirectMessageTargets(unique);
    await this.usersRepository.replaceDirectMessageAccess(id,unique,ctx?.actorUserId);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'STAFF_DIRECT_MESSAGE_ACCESS_UPDATED',module:'users',entityType:'user',entityId:id,oldValues:{directMessageUserIds:before?.selectedUserIds??[]},newValues:{directMessageUserIds:unique},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return this.usersRepository.getDirectMessageAccess(id);
  }

  private async validateDirectMessageTargets(ids:string[]){
    if(!ids.length) return;
    if(!(await this.usersRepository.directMessageTargetsExist(ids))) throw new BadRequestException('One or more direct-message contacts are invalid');
  }

  private async validateOverrides(items:Override[]){const ids=[...new Set(items.map(x=>x.permissionId))];if(!(await this.usersRepository.permissionsExist(ids))) throw new BadRequestException('One or more permission overrides are invalid');if(items.some(x=>!['ALLOW','DENY'].includes(x.effect))) throw new BadRequestException('Invalid permission override effect');}
  private clean(v:string|null){return v===null?null:v.trim()||null;}
  private generateTemporaryPassword(){return `POMS-${randomBytes(9).toString('base64url')}!`;}
}
