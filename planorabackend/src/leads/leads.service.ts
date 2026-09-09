import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { TasksService, type UploadedTaskFile } from '../tasks/tasks.service.js';
import {
  type AssignmentInput,
  type BulkAssignmentInput,
  type LeadImportRow,
  type LeadInput,
  type LeadPriority,
  type LeadStage,
  type OrganizationLeadInput,
  LeadsRepository,
} from './leads.repository.js';

type ActionContext = { actorUserId?: string; ipAddress?: string; userAgent?: string };
const STAGE_TRANSITIONS:Record<LeadStage,LeadStage[]>={NEW:['ASSIGNED'],ASSIGNED:['RESEARCHING','DISQUALIFIED'],RESEARCHING:['CONTACT_FOUND','DISQUALIFIED'],CONTACT_FOUND:['CONTACTED','RESEARCHING','DISQUALIFIED'],CONTACTED:['AWAITING_REPLY','FOLLOW_UP','ENGAGED','DISQUALIFIED'],AWAITING_REPLY:['FOLLOW_UP','ENGAGED','CONTACTED','DISQUALIFIED'],FOLLOW_UP:['CONTACTED','AWAITING_REPLY','ENGAGED','DISQUALIFIED'],ENGAGED:['FOLLOW_UP','READY_FOR_PROSPECT_REVIEW','DISQUALIFIED'],READY_FOR_PROSPECT_REVIEW:['ENGAGED','FOLLOW_UP'],QUALIFIED:[],NURTURE:['FOLLOW_UP','DISQUALIFIED'],UNQUALIFIED:[],DISQUALIFIED:[]};

@Injectable()
export class LeadsService {
  constructor(private readonly leads: LeadsRepository, private readonly audit: AuditService, private readonly tasks: TasksService) {}
  async list() { return this.leads.list(); }
  async get(id: string) { const lead=await this.leads.findById(id); if(!lead) throw new NotFoundException('Lead not found'); return lead; }
  async assignments(id: string) { await this.get(id); return this.leads.assignmentHistory(id); }
  async listOwned(userId:string){return this.leads.listOwned(userId);}
  async getOwned(id:string,userId:string){const lead=await this.leads.findOwnedById(id,userId);if(!lead)throw new NotFoundException('Lead not found');return lead;}
  async myWork(userId:string){return{metrics:await this.leads.myWorkMetrics(userId),leads:await this.leads.listOwned(userId)};}
  async ownedLeadTasks(id:string,userId:string){await this.getOwned(id,userId);return this.leads.listOwnedLeadTasks(id,userId);}

  async getAssignmentBatch(id: string) {
    const assignment = await this.leads.findAssignmentBatchById(id);

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async listAssignmentAttachments(id: string) {
    const assignment = await this.getAssignmentBatch(id);
    if (!assignment.task_id) throw new NotFoundException('Assignment task not found');
    return this.tasks.listAttachments(assignment.task_id);
  }

  async uploadAssignmentAttachment(id: string, file: UploadedTaskFile | undefined, context?: ActionContext) {
    const assignment = await this.getAssignmentBatch(id);
    if (!assignment.task_id) throw new NotFoundException('Assignment task not found');
    return this.tasks.uploadAttachment(assignment.task_id, file, context);
  }

  async getAssignmentAttachmentDownload(id: string, attachmentId: string) {
    const assignment = await this.getAssignmentBatch(id);
    if (!assignment.task_id) throw new NotFoundException('Assignment task not found');
    return this.tasks.getAttachmentDownload(assignment.task_id, attachmentId);
  }

  async deleteAssignmentAttachment(id: string, attachmentId: string, context?: ActionContext) {
    const assignment = await this.getAssignmentBatch(id);
    if (!assignment.task_id) throw new NotFoundException('Assignment task not found');
    return this.tasks.deleteAttachment(assignment.task_id, attachmentId, context);
  }


  async previewImport(body: { rows?: Partial<LeadImportRow>[] }) {
    const rows = this.normalizeImportRows(body.rows ?? []);
    if (!rows.length) throw new BadRequestException('Import file contains no data rows');
    if (rows.length > 1000) throw new BadRequestException('A single import can contain at most 1,000 rows');

    const matches = await this.leads.findImportMatches(rows);
    const seenNames = new Map<string, number>();
    const seenWebsites = new Map<string, number>();
    const seenEmails = new Map<string, number>();
    return rows.map((row) => {
      const nameKey=row.organizationName.toLowerCase().replace(/\s+/g,' ').trim();
      const websiteKey=row.website?.toLowerCase().replace(/\/$/,'') ?? null;
      const emailKey=row.email?.toLowerCase() ?? null;
      const first = seenNames.get(nameKey) ?? (websiteKey ? seenWebsites.get(websiteKey) : undefined) ?? (emailKey ? seenEmails.get(emailKey) : undefined);
      if (first !== undefined) return { ...row, status:'DUPLICATE_FILE' as const, message:`Duplicates row ${first}`, defaultAction:'SKIP' as const, existingOrganization:null };
      seenNames.set(nameKey,row.rowNumber); if(websiteKey)seenWebsites.set(websiteKey,row.rowNumber); if(emailKey)seenEmails.set(emailKey,row.rowNumber);
      const match = matches.find((candidate:any) =>
        candidate.name?.toLowerCase() === row.organizationName.toLowerCase() ||
        (row.website && candidate.website?.toLowerCase() === row.website.toLowerCase()) ||
        (row.email && candidate.email?.toLowerCase() === row.email.toLowerCase())
      );
      if (match?.has_lead) return { ...row, status:'EXISTING_LEAD' as const, message:'This organization already has an active Lead.', defaultAction:'SKIP' as const, existingOrganization:match };
      if (match) return { ...row, status:'EXISTING_ORGANIZATION' as const, message:'Organization exists. Reuse it to avoid a duplicate organization record.', defaultAction:'USE_EXISTING' as const, existingOrganization:match };
      return { ...row, status:'READY' as const, message:'Ready to import as a new organization Lead.', defaultAction:'CREATE_NEW' as const, existingOrganization:null };
    });
  }

  async commitImport(body: { rows?: Array<Partial<LeadImportRow> & { action?: 'CREATE_NEW'|'USE_EXISTING'|'SKIP'; existingOrganizationId?: string|null }> }, context?: ActionContext) {
    const submitted = body.rows ?? [];
    if (!submitted.length) throw new BadRequestException('There are no import rows to process');
    const normalized = this.normalizeImportRows(submitted);
    const byRow = new Map(submitted.map((row) => [Number(row.rowNumber), row]));
    const preview = await this.previewImport({ rows: normalized });
    const accepted: Array<LeadImportRow & { action:'CREATE_NEW'|'USE_EXISTING'; existingOrganizationId?:string|null }> = [];
    const skipped: Array<{rowNumber:number;organizationName:string;reason:string}> = [];
    for (const row of preview) {
      const submittedRow = byRow.get(row.rowNumber);
      const action = submittedRow?.action ?? row.defaultAction;
      if (action === 'SKIP') { skipped.push({rowNumber:row.rowNumber,organizationName:row.organizationName,reason:row.message}); continue; }
      if (row.status === 'DUPLICATE_FILE' || row.status === 'EXISTING_LEAD') throw new BadRequestException(`Row ${row.rowNumber} cannot be imported: ${row.message}`);
      if (action === 'USE_EXISTING') {
        const existingId = submittedRow?.existingOrganizationId ?? row.existingOrganization?.id;
        if (row.status !== 'EXISTING_ORGANIZATION' || !existingId) throw new BadRequestException(`Row ${row.rowNumber} cannot reuse an organization`);
        accepted.push({...row,action,existingOrganizationId:existingId});
      } else {
        if (row.status !== 'READY') throw new BadRequestException(`Row ${row.rowNumber} must be reviewed before creating a new organization`);
        accepted.push({...row,action:'CREATE_NEW',existingOrganizationId:null});
      }
    }
    if (!accepted.length) return {created:[],skipped,totalCreated:0,totalSkipped:skipped.length};
    const created = await this.leads.importOrganizationLeads(accepted, context?.actorUserId);
    await this.audit.log({actorUserId:context?.actorUserId,action:'LEAD_IMPORT_COMPLETED',module:'leads',entityType:'lead_import',newValues:{createdCount:created.length,skippedCount:skipped.length,rows:created.map((row)=>({rowNumber:row.rowNumber,leadId:row.leadId,organizationId:row.organizationId,reusedOrganization:row.reusedOrganization}))},ipAddress:context?.ipAddress,userAgent:context?.userAgent});
    return {created,skipped,totalCreated:created.length,totalSkipped:skipped.length};
  }

  private normalizeImportRows(rows: Partial<LeadImportRow>[]): LeadImportRow[] {
    const priorities: LeadPriority[]=['LOW','MEDIUM','HIGH','URGENT'];
    return rows.map((input,index) => {
      const rowNumber = Number(input.rowNumber || index+2);
      const organizationName = input.organizationName?.trim() ?? '';
      if (!organizationName) throw new BadRequestException(`Row ${rowNumber}: organization_name is required`);
      if (organizationName.length > 240) throw new BadRequestException(`Row ${rowNumber}: organization name is too long`);
      const rawPriority=(input.priority??'MEDIUM').toString().trim().toUpperCase() as LeadPriority;
      if (!priorities.includes(rawPriority)) throw new BadRequestException(`Row ${rowNumber}: priority must be LOW, MEDIUM, HIGH or URGENT`);
      const email=this.clean(input.email);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException(`Row ${rowNumber}: general_email is invalid`);
      const proposedRaw=input.proposedRevenue as unknown;
      const probabilityRaw=input.revenueProbability as unknown;
      const proposedRevenue=proposedRaw===null||proposedRaw===undefined||String(proposedRaw).trim()===''?1000000:Number(proposedRaw);
      const revenueProbability=probabilityRaw===null||probabilityRaw===undefined||String(probabilityRaw).trim()===''?30:Number(probabilityRaw);
      if(!Number.isFinite(proposedRevenue)||proposedRevenue<0) throw new BadRequestException(`Row ${rowNumber}: proposed_revenue must be zero or a positive number`);
      if(!Number.isFinite(revenueProbability)||revenueProbability<0||revenueProbability>100) throw new BadRequestException(`Row ${rowNumber}: revenue_probability must be between 0 and 100`);
      return {rowNumber,organizationName,website:this.clean(input.website),industry:this.clean(input.industry),location:this.clean(input.location),email,phone:this.clean(input.phone),source:this.clean(input.source),priority:rawPriority,notes:this.clean(input.notes),proposedRevenue,revenueProbability};
    });
  }

  async createOrganizationLead(body: Partial<OrganizationLeadInput>, context?: ActionContext) {
    const organizationName = body.organizationName?.trim();
    if (!organizationName) throw new BadRequestException('Organization name is required');
    const priority = body.priority ?? 'MEDIUM';
    if (!(['LOW','MEDIUM','HIGH','URGENT'] as LeadPriority[]).includes(priority)) throw new BadRequestException('Invalid lead priority');
    const proposedRevenue=Number(body.proposedRevenue??1000000), revenueProbability=Number(body.revenueProbability??30); if(!Number.isFinite(proposedRevenue)||proposedRevenue<0)throw new BadRequestException('Proposed revenue must be a positive number'); if(!Number.isFinite(revenueProbability)||revenueProbability<0||revenueProbability>100)throw new BadRequestException('Revenue probability must be between 0 and 100');
    const website=this.clean(body.website), email=this.clean(body.email);
    const duplicate=await this.leads.findOrganizationDuplicate(organizationName, website, email);
    if (duplicate) throw new BadRequestException(`Organization already exists as ${duplicate.name}. Use the existing organization instead of creating a duplicate.`);
    const lead=await this.leads.createOrganizationLead({
      organizationName, website, industry:this.clean(body.industry), location:this.clean(body.location),
      email, phone:this.clean(body.phone), source:this.clean(body.source), priority, notes:this.clean(body.notes), proposedRevenue, revenueProbability,
    }, context?.actorUserId);
    await this.audit.log({ actorUserId:context?.actorUserId, action:'LEAD_POOL_CREATED', module:'leads', entityType:'lead', entityId:lead.id,
      newValues:lead, ipAddress:context?.ipAddress, userAgent:context?.userAgent });
    return this.get(lead.id);
  }

  async availablePool(userId:string){ return this.leads.availablePool(userId); }
  async claimLead(id:string,userId:string,context?:ActionContext){
    const lead=await this.leads.claimLead(id,userId); if(!lead) throw new BadRequestException('This Lead has already been picked or assigned');
    await this.audit.log({actorUserId:userId,action:'LEAD_CLAIMED_FROM_POOL',module:'leads',entityType:'lead',entityId:id,newValues:{assignedToId:userId},ipAddress:context?.ipAddress,userAgent:context?.userAgent});
    return this.getOwned(id,userId);
  }
  async assignTeam(id:string,teamId:string|null,context?:ActionContext){
    const current=await this.get(id); if(teamId&&!(await this.leads.teamExists(teamId))) throw new BadRequestException('Select an active Team'); const updated=await this.leads.assignTeam(id,teamId); if(!updated) throw new NotFoundException('Lead not found');
    await this.audit.log({actorUserId:context?.actorUserId,action:teamId?'LEAD_ASSIGNED_TO_TEAM':'LEAD_TEAM_UNASSIGNED',module:'leads',entityType:'lead',entityId:id,oldValues:{teamId:current.assigned_team_id},newValues:{teamId},ipAddress:context?.ipAddress,userAgent:context?.userAgent}); return this.get(id);
  }
  async updateRevenue(id:string,body:{proposedRevenue?:number;revenueProbability?:number;actualRevenue?:number|null},context?:ActionContext){
    const current=await this.get(id); const proposed=Number(body.proposedRevenue??current.proposed_revenue??1000000); const probability=Number(body.revenueProbability??current.revenue_probability??30); const actual=body.actualRevenue===undefined?(current.actual_revenue??null):body.actualRevenue;
    if(!Number.isFinite(proposed)||proposed<0) throw new BadRequestException('Proposed revenue must be a positive number'); if(!Number.isFinite(probability)||probability<0||probability>100) throw new BadRequestException('Revenue probability must be between 0 and 100');
    await this.leads.updateRevenue(id,proposed,probability,actual===null?null:Number(actual)); await this.audit.log({actorUserId:context?.actorUserId,action:'LEAD_REVENUE_UPDATED',module:'leads',entityType:'lead',entityId:id,oldValues:{proposedRevenue:current.proposed_revenue,revenueProbability:current.revenue_probability,actualRevenue:current.actual_revenue},newValues:{proposedRevenue:proposed,revenueProbability:probability,actualRevenue:actual},ipAddress:context?.ipAddress,userAgent:context?.userAgent}); return this.get(id);
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

  async reassign(id:string,body:Partial<AssignmentInput>,context?:ActionContext){const reason=this.clean(body.reason);if(!reason)throw new BadRequestException('Reassignment reason is required');const current=await this.get(id);const assignedToId=this.clean(body.assignedToId);if(!assignedToId||!(await this.leads.eligibleOperationalStaff(assignedToId)))throw new BadRequestException('Select an eligible active staff member');if(assignedToId===current.assigned_to_id)throw new BadRequestException('Select a different staff member');const updated=await this.leads.assign(id,current.assigned_to_id,{assignedToId,reason},context?.actorUserId);await this.audit.log({actorUserId:context?.actorUserId,action:'LEAD_REASSIGNED',module:'leads',entityType:'lead',entityId:id,oldValues:{assignedToId:current.assigned_to_id},newValues:{assignedToId,reason},ipAddress:context?.ipAddress,userAgent:context?.userAgent});return updated;}

  async changeStage(id:string,next:LeadStage,context?:ActionContext,ownerId?:string,reason?:string|null){const current=ownerId?await this.getOwned(id,ownerId):await this.get(id);const allowed=STAGE_TRANSITIONS[current.stage as LeadStage]??[];if(!next||!allowed.includes(next))throw new BadRequestException(`Lead cannot move from ${current.stage} to ${next||'an invalid stage'}`);await this.leads.updateStage(id,next);await this.audit.log({actorUserId:context?.actorUserId,action:'LEAD_STAGE_CHANGED',module:'leads',entityType:'lead',entityId:id,oldValues:{stage:current.stage},newValues:{stage:next,reason:this.clean(reason)},ipAddress:context?.ipAddress,userAgent:context?.userAgent});return ownerId?this.getOwned(id,ownerId):this.get(id);}
  allowedStages(stage:LeadStage){return STAGE_TRANSITIONS[stage]??[];}

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
