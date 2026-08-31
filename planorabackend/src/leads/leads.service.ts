import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import {
  type AssignmentInput,
  type BulkAssignmentInput,
  type LeadInput,
  type LeadPriority,
  type LeadStage,
  type OrganizationLeadInput,
  LeadsRepository,
} from './leads.repository.js';

type ActionContext = { actorUserId?: string; ipAddress?: string; userAgent?: string };

@Injectable()
export class LeadsService {
  constructor(private readonly leads: LeadsRepository, private readonly audit: AuditService) {}
  async list() { return this.leads.list(); }
  async get(id: string) { const lead=await this.leads.findById(id); if(!lead) throw new NotFoundException('Lead not found'); return lead; }
  async assignments(id: string) { await this.get(id); return this.leads.assignmentHistory(id); }

  async createOrganizationLead(body: Partial<OrganizationLeadInput>, context?: ActionContext) {
    const organizationName = body.organizationName?.trim();
    if (!organizationName) throw new BadRequestException('Organization name is required');
    const priority = body.priority ?? 'MEDIUM';
    if (!(['LOW','MEDIUM','HIGH','URGENT'] as LeadPriority[]).includes(priority)) throw new BadRequestException('Invalid lead priority');
    const website=this.clean(body.website), email=this.clean(body.email);
    const duplicate=await this.leads.findOrganizationDuplicate(organizationName, website, email);
    if (duplicate) throw new BadRequestException(`Organization already exists as ${duplicate.name}. Use the existing organization instead of creating a duplicate.`);
    const lead=await this.leads.createOrganizationLead({
      organizationName, website, industry:this.clean(body.industry), location:this.clean(body.location),
      email, phone:this.clean(body.phone), source:this.clean(body.source), priority, notes:this.clean(body.notes),
    }, context?.actorUserId);
    await this.audit.log({ actorUserId:context?.actorUserId, action:'LEAD_POOL_CREATED', module:'leads', entityType:'lead', entityId:lead.id,
      newValues:lead, ipAddress:context?.ipAddress, userAgent:context?.userAgent });
    return this.get(lead.id);
  }

  async create(body: Partial<LeadInput>, context?: ActionContext) {
    const input=await this.validate(body); const lead=await this.leads.create(input, context?.actorUserId);
    await this.audit.log({actorUserId:context?.actorUserId,action:'LEAD_CREATED',module:'leads',entityType:'lead',entityId:lead.id,newValues:lead,ipAddress:context?.ipAddress,userAgent:context?.userAgent});
    return this.get(lead.id);
  }

  async update(id:string, body:Partial<LeadInput>, context?:ActionContext) {
    const current=await this.get(id);
    const input=await this.validate({organizationId:body.organizationId??current.organization_id, primaryContactId:body.primaryContactId===undefined?current.primary_contact_id:body.primaryContactId,
      assignedToId:current.assigned_to_id,title:body.title??current.title,source:body.source===undefined?current.source:body.source,stage:body.stage??current.stage,
      priority:body.priority??current.priority,nextAction:body.nextAction===undefined?current.next_action:body.nextAction,nextFollowUpAt:body.nextFollowUpAt===undefined?current.next_follow_up_at:body.nextFollowUpAt,
      notes:body.notes===undefined?current.notes:body.notes});
    const updated=await this.leads.update(id,input); if(!updated) throw new NotFoundException('Lead not found');
    await this.audit.log({actorUserId:context?.actorUserId,action:input.stage!==current.stage?'LEAD_STAGE_CHANGED':'LEAD_UPDATED',module:'leads',entityType:'lead',entityId:id,oldValues:current,newValues:updated,ipAddress:context?.ipAddress,userAgent:context?.userAgent});
    return this.get(id);
  }

  async assign(id:string, body:Partial<AssignmentInput>, context?:ActionContext) {
    const current=await this.get(id); const assignedToId=body.assignedToId===undefined?current.assigned_to_id:this.clean(body.assignedToId);
    if(assignedToId && !(await this.leads.userExists(assignedToId))) throw new BadRequestException('Assigned staff member is invalid or unavailable');
    if(assignedToId===current.assigned_to_id) throw new BadRequestException('Select a different staff member');
    const updated=await this.leads.assign(id,current.assigned_to_id,{assignedToId,reason:this.clean(body.reason)},context?.actorUserId);
    await this.audit.log({actorUserId:context?.actorUserId,action:current.assigned_to_id?'LEAD_REASSIGNED':'LEAD_ASSIGNED',module:'leads',entityType:'lead',entityId:id,oldValues:{assignedToId:current.assigned_to_id},newValues:{assignedToId:updated?.assigned_to_id,reason:this.clean(body.reason)},ipAddress:context?.ipAddress,userAgent:context?.userAgent});
    return updated;
  }

  async bulkAssign(body: Partial<BulkAssignmentInput>, context?: ActionContext) {
    const leadIds = [...new Set((body.leadIds ?? []).map((id) => id?.trim()).filter(Boolean))];
    if (!leadIds.length) throw new BadRequestException('Select at least one organization lead');
    if (leadIds.length > 500) throw new BadRequestException('A single assignment can contain at most 500 leads');

    const assignedToId = body.assignedToId?.trim();
    if (!assignedToId || !(await this.leads.userExists(assignedToId))) {
      throw new BadRequestException('Select an active staff member');
    }

    const title = body.title?.trim();
    if (!title) throw new BadRequestException('Assignment title is required');
    if (title.length > 220) throw new BadRequestException('Assignment title is too long');

    const instructions = body.instructions?.trim();
    if (!instructions) throw new BadRequestException('Assignment instructions are required');

    const dueAt = body.dueAt?.trim();
    const dueDate = dueAt ? new Date(dueAt) : null;
    if (!dueAt || !dueDate || Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('A valid assignment deadline is required');
    }

    const priority = body.priority ?? 'MEDIUM';
    if (!(['LOW','MEDIUM','HIGH','URGENT'] as LeadPriority[]).includes(priority)) {
      throw new BadRequestException('Invalid assignment priority');
    }

    const selected = await this.leads.findLeadPoolByIds(leadIds);
    if (selected.length !== leadIds.length) {
      throw new BadRequestException('One or more selected records are not available organization leads');
    }

    let result;
    try {
      const workflowSteps=(body.workflowSteps??[]).filter((s:any)=>s?.title?.trim()).map((s:any)=>({title:s.title.trim(),description:s.description?.trim()||null,evidenceRequired:!!s.evidenceRequired}));
      if(!workflowSteps.length && !body.workflowId) throw new BadRequestException('Select a pursuit workflow');
      result = await this.leads.bulkAssign({leadIds,assignedToId,title,instructions,dueAt,priority,workflowId:body.workflowId??null,workflowSteps}, context?.actorUserId);
    } catch (error) {
      if (error instanceof Error && error.message.includes('no longer available')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    await this.audit.log({
      actorUserId:context?.actorUserId,
      action:'LEAD_ASSIGNMENT_BATCH_CREATED',
      module:'leads',
      entityType:'lead_assignment_batch',
      entityId:result.batchId,
      newValues:{...result,leadIds,instructions,priority},
      ipAddress:context?.ipAddress,
      userAgent:context?.userAgent,
    });

    return result;
  }

  private async validate(body:Partial<LeadInput>):Promise<LeadInput> {
    const organizationId=body.organizationId?.trim(), title=body.title?.trim();
    if(!organizationId||!title) throw new BadRequestException('Organization and lead title are required');
    if(!(await this.leads.organizationExists(organizationId))) throw new BadRequestException('Invalid organization');
    const primaryContactId=this.clean(body.primaryContactId);
    if(primaryContactId && !(await this.leads.contactBelongsToOrganization(primaryContactId,organizationId))) throw new BadRequestException('Primary contact must belong to the selected organization');
    const assignedToId=this.clean(body.assignedToId);
    if(assignedToId && !(await this.leads.userExists(assignedToId))) throw new BadRequestException('Assigned staff member is invalid');
    const stage=body.stage??'NEW';
    const stages:LeadStage[]=['NEW','ASSIGNED','RESEARCHING','CONTACT_FOUND','CONTACTED','AWAITING_REPLY','FOLLOW_UP','ENGAGED','READY_FOR_PROSPECT_REVIEW','QUALIFIED','NURTURE','UNQUALIFIED','DISQUALIFIED'];
    if(!stages.includes(stage)) throw new BadRequestException('Invalid lead stage');
    const priority=body.priority??'MEDIUM'; if(!(['LOW','MEDIUM','HIGH','URGENT'] as LeadPriority[]).includes(priority)) throw new BadRequestException('Invalid lead priority');
    return {organizationId,primaryContactId,assignedToId,title,source:this.clean(body.source),stage,priority,nextAction:this.clean(body.nextAction),nextFollowUpAt:this.clean(body.nextFollowUpAt),notes:this.clean(body.notes)};
  }
  private clean(value:string|null|undefined){ if(value===null||value===undefined)return null; return value.trim()||null; }
}
