import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';

type Ctx={actorUserId?:string;ipAddress?:string;userAgent?:string};
type StepInput={title:string;guidance?:string|null;requiresEvidence?:boolean};
type WorkflowInput={name:string;description?:string|null;category?:string|null;isActive?:boolean;steps?:StepInput[]};

@Injectable()
export class TaskWorkflowsService{
  constructor(private readonly db:DatabaseService,private readonly audit:AuditService){}

  async list(activeOnly=false){
    const result=await this.db.query(`SELECT w.*,COALESCE(json_agg(json_build_object('id',s.id,'position',s.position,'title',s.title,'guidance',s.guidance,'requires_evidence',s.requires_evidence) ORDER BY s.position) FILTER (WHERE s.id IS NOT NULL),'[]'::json) AS steps FROM task_workflows w LEFT JOIN task_workflow_steps s ON s.workflow_id=w.id ${activeOnly?'WHERE w.is_active = TRUE':''} GROUP BY w.id ORDER BY w.is_active DESC,w.name ASC`);
    return result.rows;
  }

  async get(id:string){const rows=await this.list();const item=rows.find((row)=>String(row.id)===id);if(!item)throw new NotFoundException('Task workflow not found');return item;}

  async create(input:WorkflowInput,ctx?:Ctx){
    const name=input.name?.trim();if(!name)throw new BadRequestException('Workflow name is required');
    const steps=this.validateSteps(input.steps??[]);
    const client=await this.db.getClient();
    try{await client.query('BEGIN');const w=(await client.query(`INSERT INTO task_workflows(name,description,category,is_active,created_by_id) VALUES($1,$2,$3,$4,$5) RETURNING id`,[name,input.description?.trim()||null,input.category?.trim()||null,input.isActive??true,ctx?.actorUserId??null])).rows[0];
      for(let i=0;i<steps.length;i++){const s=steps[i];await client.query(`INSERT INTO task_workflow_steps(workflow_id,position,title,guidance,requires_evidence) VALUES($1,$2,$3,$4,$5)`,[w.id,i+1,s.title,s.guidance,s.requiresEvidence]);}
      await client.query('COMMIT');await this.audit.log({actorUserId:ctx?.actorUserId,action:'TASK_WORKFLOW_CREATED',module:'task_workflows',entityType:'task_workflow',entityId:w.id,newValues:{name,steps:steps.length},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});return this.get(String(w.id));
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async update(id:string,input:WorkflowInput,ctx?:Ctx){await this.get(id);const name=input.name?.trim();if(!name)throw new BadRequestException('Workflow name is required');const steps=this.validateSteps(input.steps??[]);const client=await this.db.getClient();try{await client.query('BEGIN');await client.query(`UPDATE task_workflows SET name=$2,description=$3,category=$4,is_active=$5,updated_at=NOW() WHERE id=$1`,[id,name,input.description?.trim()||null,input.category?.trim()||null,input.isActive??true]);await client.query(`DELETE FROM task_workflow_steps WHERE workflow_id=$1`,[id]);for(let i=0;i<steps.length;i++){const s=steps[i];await client.query(`INSERT INTO task_workflow_steps(workflow_id,position,title,guidance,requires_evidence) VALUES($1,$2,$3,$4,$5)`,[id,i+1,s.title,s.guidance,s.requiresEvidence]);}await client.query('COMMIT');await this.audit.log({actorUserId:ctx?.actorUserId,action:'TASK_WORKFLOW_UPDATED',module:'task_workflows',entityType:'task_workflow',entityId:id,newValues:{name,steps:steps.length},ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});return this.get(id);}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}

  async archive(id:string,ctx?:Ctx){await this.get(id);await this.db.query(`UPDATE task_workflows SET is_active=FALSE,updated_at=NOW() WHERE id=$1`,[id]);await this.audit.log({actorUserId:ctx?.actorUserId,action:'TASK_WORKFLOW_ARCHIVED',module:'task_workflows',entityType:'task_workflow',entityId:id,ipAddress:ctx?.ipAddress,userAgent:ctx?.userAgent});return {id};}

  private validateSteps(input:StepInput[]){if(input.length===0)throw new BadRequestException('Add at least one workflow step');return input.map((step,index)=>{const title=step.title?.trim();if(!title)throw new BadRequestException(`Step ${index+1} needs a title`);return {title,guidance:step.guidance?.trim()||null,requiresEvidence:Boolean(step.requiresEvidence)};});}
}
