import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { type StaffStatus, UsersRepository } from './users.repository.js';

type Ctx={actorUserId?:string;ipAddress?:string;userAgent?:string};
type Override={permissionId:string;effect:'ALLOW'|'DENY';reason?:string};
export type UpdateStaffInput={
  firstName?:string;lastName?:string;email?:string;phone?:string|null;jobTitle?:string|null;
  roleId?:string;departmentId?:string|null;teamIds?:string[];permissionOverrides?:Override[];
};

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository:UsersRepository,private readonly supabase:SupabaseService,private readonly audit:AuditService){}

  listStaff(){ return this.usersRepository.listStaff(); }

  async getStaff(id:string){
    const s=await this.usersRepository.getStaffProfile(id);
    if(!s) throw new NotFoundException('Staff member not found');
    return s;
  }

  async createStaff(dto:CreateStaffDto,ctx?:Ctx){
    const email=dto.email.trim().toLowerCase();
    if(await this.usersRepository.findByEmail(email)) throw new ConflictException('A staff account with this email already exists');
    if(!(await this.usersRepository.getRole(dto.roleId))) throw new BadRequestException('Invalid role');
    const departmentId=dto.departmentId??null;
    if(!departmentId) throw new BadRequestException('Create/select a department before creating staff');
    if(!(await this.usersRepository.departmentExists(departmentId))) throw new BadRequestException('Invalid department');
    if(!(await this.usersRepository.roleAllowedInDepartment(dto.roleId,departmentId))) throw new BadRequestException('This role is not available in the selected department');
    const teamIds=[...new Set(dto.teamIds??[])];
    if(!(await this.usersRepository.teamsExist(teamIds))) throw new BadRequestException('One or more teams are invalid');
    const permissionOverrides=dto.permissionOverrides??[];
    await this.validateOverrides(permissionOverrides);
    const temporaryPassword=this.generateTemporaryPassword();
    const {data,error}=await this.supabase.admin.auth.admin.createUser({
      email,password:temporaryPassword,email_confirm:true,
      user_metadata:{first_name:dto.firstName.trim(),last_name:dto.lastName.trim(),must_change_password:true},
    });
    if(error||!data.user) throw new BadRequestException(error?.message??'Unable to create authentication account');
    let staff:any;
    try{
      staff=await this.usersRepository.createStaff({
        authUserId:data.user.id,firstName:dto.firstName.trim(),lastName:dto.lastName.trim(),email,
        phone:dto.phone?.trim(),jobTitle:dto.jobTitle?.trim(),roleId:dto.roleId,departmentId:departmentId??undefined,createdById:ctx?.actorUserId,
      });
      await this.usersRepository.addTeamMemberships(staff.id,teamIds);
      await this.usersRepository.addPermissionOverrides(staff.id,permissionOverrides,ctx?.actorUserId);
      await this.audit.log({actorUserId:ctx?.actorUserId,action:'STAFF_CREATED',module:'users',entityType:'user',entityId:staff.id,
        newValues:{firstName:staff.first_name,lastName:staff.last_name,email:staff.email,roleId:staff.role_id,departmentId:staff.department_id,teamIds,permissionOverrides},
        ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
      return {staff,temporaryPassword};
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
    const departmentId=input.departmentId===undefined?current.department_id:input.departmentId;
    if(departmentId && !(await this.usersRepository.departmentExists(departmentId))) throw new BadRequestException('Invalid department');
    if(!(await this.usersRepository.roleAllowedInDepartment(roleId,departmentId))) throw new BadRequestException('This role is not available in the selected department');
    const teamIds=input.teamIds===undefined?undefined:[...new Set(input.teamIds)];
    if(teamIds && !(await this.usersRepository.teamsExist(teamIds))) throw new BadRequestException('One or more teams are invalid');
    if(input.permissionOverrides) await this.validateOverrides(input.permissionOverrides);
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
      if(error) throw new BadRequestException(error.message);
    }

    const updated=await this.usersRepository.updateStaff(id,{
      firstName,lastName,email,
      phone:input.phone===undefined?current.phone:this.clean(input.phone),
      jobTitle:input.jobTitle===undefined?current.job_title:this.clean(input.jobTitle),
      roleId,departmentId,
    });
    if(teamIds) await this.usersRepository.replaceTeamMemberships(id,teamIds);
    if(input.permissionOverrides) await this.usersRepository.replacePermissionOverrides(id,input.permissionOverrides,ctx?.actorUserId);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'STAFF_UPDATED',module:'users',entityType:'user',entityId:id,
      oldValues:{firstName:current.first_name,lastName:current.last_name,email:current.email,roleId:current.role_id,departmentId:current.department_id},
      newValues:{firstName:updated.first_name,lastName:updated.last_name,email:updated.email,roleId:updated.role_id,departmentId:updated.department_id,...(teamIds?{teamIds}:{}),...(input.permissionOverrides?{permissionOverrides:input.permissionOverrides}:{})},
      ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return this.getStaff(id);
  }

  async setStaffStatus(id:string,status:Extract<StaffStatus,'ACTIVE'|'SUSPENDED'|'DISABLED'>,ctx?:Ctx){
    const current=await this.requireStaff(id);
    const role=await this.usersRepository.getRole(current.role_id);
    if(role?.code==='SUPER_ADMIN' && status!=='ACTIVE') await this.protectLastSuperAdmin();
    if(current.auth_user_id){
      const {error}=await this.supabase.admin.auth.admin.updateUserById(current.auth_user_id,{ban_duration:status==='ACTIVE'?'none':'876000h'});
      if(error) throw new BadRequestException(error.message);
    }
    await this.usersRepository.setStatus(id,status);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:status==='ACTIVE'?'STAFF_REACTIVATED':status==='SUSPENDED'?'STAFF_SUSPENDED':'STAFF_DISABLED',
      module:'users',entityType:'user',entityId:id,oldValues:{status:current.status},newValues:{status},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return this.getStaff(id);
  }

  async resetPassword(id:string,ctx?:Ctx){
    const staff=await this.requireStaff(id);
    if(!staff.auth_user_id) throw new BadRequestException('This staff account has no authentication account');
    const temporaryPassword=this.generateTemporaryPassword();
    const {error}=await this.supabase.admin.auth.admin.updateUserById(staff.auth_user_id,{password:temporaryPassword,user_metadata:{must_change_password:true}});
    if(error) throw new BadRequestException(error.message);
    await this.usersRepository.markPasswordResetRequired(id);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'STAFF_PASSWORD_RESET',module:'users',entityType:'user',entityId:id,newValues:{mustChangePassword:true},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return {temporaryPassword};
  }

  private async requireStaff(id:string){const s=await this.usersRepository.findById(id);if(!s) throw new NotFoundException('Staff member not found');return s;}
  private async protectLastSuperAdmin(){if((await this.usersRepository.countEnabledSuperAdmins())<=1) throw new BadRequestException('The last enabled Super Admin cannot be suspended, disabled or moved to another role');}
  private async validateOverrides(items:Override[]){const ids=[...new Set(items.map(x=>x.permissionId))];if(!(await this.usersRepository.permissionsExist(ids))) throw new BadRequestException('One or more permission overrides are invalid');if(items.some(x=>!['ALLOW','DENY'].includes(x.effect))) throw new BadRequestException('Invalid permission override effect');}
  private clean(v:string|null){return v===null?null:v.trim()||null;}
  private generateTemporaryPassword(){return `POMS-${randomBytes(9).toString('base64url')}!`;}
}
