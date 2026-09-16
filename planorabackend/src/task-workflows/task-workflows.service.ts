import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';

type Ctx={actorUserId?:string;ipAddress?:string;userAgent?:string};
type StepInput={title:string;guidance?:string|null;requiresEvidence?:boolean};
type ScopeType='GENERAL'|'ROLE'|'TEAM'|'DEPARTMENT';
type WorkflowInput={name:string;description?:string|null;category?:string|null;isActive?:boolean;isDefaultForScope?:boolean;scopeType?:ScopeType;roleId?:string|null;teamId?:string|null;departmentId?:string|null;steps?:StepInput[]};

@Injectable()
export class TaskWorkflowsService{
  constructor(private readonly db:DatabaseService,private readonly audit:AuditService){}

  async list(activeOnly=false){
    const result=await this.db.query(`
      SELECT
        w.*,
        r.name AS role_name,
        t.name AS team_name,
        d.name AS department_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id',s.id,
              'position',s.position,
              'title',s.title,
              'guidance',s.guidance,
              'requires_evidence',s.requires_evidence
            ) ORDER BY s.position
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'::json
        ) AS steps
      FROM task_workflows w
      LEFT JOIN roles r ON r.id=w.role_id
      LEFT JOIN teams t ON t.id=w.team_id
      LEFT JOIN departments d ON d.id=w.department_id
      LEFT JOIN task_workflow_steps s ON s.workflow_id=w.id
      ${activeOnly?'WHERE w.is_active=TRUE':''}
      GROUP BY w.id,r.name,t.name,d.name
      ORDER BY w.is_active DESC,w.scope_type,w.name
    `);
    return result.rows;
  }

  async get(id:string){
    const rows=await this.list(false);
    const item=rows.find((row)=>String(row.id)===id);
    if(!item)throw new NotFoundException('Task workflow not found');
    return item;
  }

  async eligible(input:{assignmentType?:string;staffId?:string|null;teamId?:string|null;departmentId?:string|null}){
    const type=String(input.assignmentType||'UNASSIGNED').toUpperCase();
    let roleId:string|null=null;
    let departmentId=input.departmentId||null;
    if(type==='STAFF'&&input.staffId){
      const user=(await this.db.query(`SELECT role_id,department_id FROM users WHERE id=$1 LIMIT 1`,[input.staffId])).rows[0];
      if(!user)throw new BadRequestException('Staff member not found');
      roleId=user.role_id;
      departmentId=user.department_id;
    }
    const rows=await this.list(true);
    return rows.filter((w:any)=>{
      if(w.scope_type==='GENERAL')return true;
      if(type==='STAFF'&&w.scope_type==='ROLE'&&roleId&&w.role_id===roleId)return true;
      if(type==='TEAM'&&w.scope_type==='TEAM'&&input.teamId&&w.team_id===input.teamId)return true;
      if(type==='DEPARTMENT'&&w.scope_type==='DEPARTMENT'&&departmentId&&w.department_id===departmentId)return true;
      return false;
    });
  }

  async create(input:WorkflowInput,ctx?:Ctx){
    const normalized=await this.normalize(input);
    const client=await this.db.getClient();
    try{
      await client.query('BEGIN');
      if(normalized.isDefaultForScope){await this.clearScopeDefault(client,normalized);}
      const w=(await client.query(`
        INSERT INTO task_workflows(
          name,description,category,is_active,created_by_id,
          scope_type,role_id,team_id,department_id,is_default_for_scope
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `,[normalized.name,normalized.description,normalized.category,normalized.isActive,ctx?.actorUserId??null,normalized.scopeType,normalized.roleId,normalized.teamId,normalized.departmentId,normalized.isDefaultForScope])).rows[0];
      for(let i=0;i<normalized.steps.length;i++){
        const s=normalized.steps[i];
        await client.query(`INSERT INTO task_workflow_steps(workflow_id,position,title,guidance,requires_evidence) VALUES($1,$2,$3,$4,$5)`,[w.id,i+1,s.title,s.guidance,s.requiresEvidence]);
      }
      await client.query('COMMIT');
      await this.audit.log({actorUserId:ctx?.actorUserId,action:'TASK_WORKFLOW_CREATED',module:'task_workflows',entityType:'task_workflow',entityId:w.id,newValues:{name:normalized.name,scopeType:normalized.scopeType,steps:normalized.steps.length},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
      return this.get(String(w.id));
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async update(id:string,input:WorkflowInput,ctx?:Ctx){
    await this.get(id);
    const normalized=await this.normalize(input);
    const client=await this.db.getClient();
    try{
      await client.query('BEGIN');
      if(normalized.isDefaultForScope){await this.clearScopeDefault(client,normalized,id);}
      await client.query(`
        UPDATE task_workflows SET
          name=$2,description=$3,category=$4,is_active=$5,
          scope_type=$6,role_id=$7,team_id=$8,department_id=$9,
          is_default_for_scope=$10,updated_at=NOW()
        WHERE id=$1
      `,[id,normalized.name,normalized.description,normalized.category,normalized.isActive,normalized.scopeType,normalized.roleId,normalized.teamId,normalized.departmentId,normalized.isDefaultForScope]);
      await client.query(`DELETE FROM task_workflow_steps WHERE workflow_id=$1`,[id]);
      for(let i=0;i<normalized.steps.length;i++){
        const s=normalized.steps[i];
        await client.query(`INSERT INTO task_workflow_steps(workflow_id,position,title,guidance,requires_evidence) VALUES($1,$2,$3,$4,$5)`,[id,i+1,s.title,s.guidance,s.requiresEvidence]);
      }
      await client.query('COMMIT');
      await this.audit.log({actorUserId:ctx?.actorUserId,action:'TASK_WORKFLOW_UPDATED',module:'task_workflows',entityType:'task_workflow',entityId:id,newValues:{name:normalized.name,scopeType:normalized.scopeType,steps:normalized.steps.length},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
      return this.get(id);
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async archive(id:string,ctx?:Ctx){
    await this.get(id);
    await this.db.query(`UPDATE task_workflows SET is_active=FALSE,is_default_for_scope=FALSE,updated_at=NOW() WHERE id=$1`,[id]);
    await this.audit.log({actorUserId:ctx?.actorUserId,action:'TASK_WORKFLOW_ARCHIVED',module:'task_workflows',entityType:'task_workflow',entityId:id,ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});
    return {id};
  }

  private async normalize(input:WorkflowInput){
    const name=input.name?.trim();
    if(!name)throw new BadRequestException('Workflow name is required');
    const steps=this.validateSteps(input.steps??[]);
    const scopeType=(input.scopeType??'GENERAL') as ScopeType;
    if(!['GENERAL','ROLE','TEAM','DEPARTMENT'].includes(scopeType))throw new BadRequestException('Invalid workflow scope');
    let roleId=input.roleId||null,teamId=input.teamId||null,departmentId=input.departmentId||null;
    if(scopeType==='GENERAL'){roleId=null;teamId=null;departmentId=null;}
    if(scopeType==='ROLE'){
      if(!roleId)throw new BadRequestException('Choose a role for this workflow');
      if(!(await this.exists('roles',roleId)))throw new BadRequestException('Role not found');
      teamId=null;departmentId=null;
    }
    if(scopeType==='TEAM'){
      if(!teamId)throw new BadRequestException('Choose a team for this workflow');
      if(!(await this.exists('teams',teamId)))throw new BadRequestException('Team not found');
      roleId=null;departmentId=null;
    }
    if(scopeType==='DEPARTMENT'){
      if(!departmentId)throw new BadRequestException('Choose a department for this workflow');
      if(!(await this.exists('departments',departmentId)))throw new BadRequestException('Department not found');
      roleId=null;teamId=null;
    }
    return {name,description:input.description?.trim()||null,category:input.category?.trim()||null,isActive:input.isActive??true,isDefaultForScope:Boolean(input.isDefaultForScope),scopeType,roleId,teamId,departmentId,steps};
  }

  private async exists(table:'roles'|'teams'|'departments',id:string){
    const r=await this.db.query(`SELECT 1 FROM ${table} WHERE id=$1 LIMIT 1`,[id]);
    return r.rowCount===1;
  }

  private async clearScopeDefault(client:any,n:any,excludeId?:string){
    await client.query(`
      UPDATE task_workflows SET is_default_for_scope=FALSE
      WHERE ($1::uuid IS NULL OR id<>$1::uuid)
        AND scope_type=$2
        AND role_id IS NOT DISTINCT FROM $3::uuid
        AND team_id IS NOT DISTINCT FROM $4::uuid
        AND department_id IS NOT DISTINCT FROM $5::uuid
    `,[excludeId??null,n.scopeType,n.roleId,n.teamId,n.departmentId]);
  }

  private validateSteps(input:StepInput[]){
    if(input.length===0)throw new BadRequestException('Add at least one workflow step');
    return input.map((step,index)=>{const title=step.title?.trim();if(!title)throw new BadRequestException(`Step ${index+1} needs a title`);return{title,guidance:step.guidance?.trim()||null,requiresEvidence:Boolean(step.requiresEvidence)};});
  }
}
