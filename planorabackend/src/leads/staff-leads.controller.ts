import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard.js";
import { PermissionGuard } from "../permissions/permission.guard.js";
import { RequirePermission } from "../auth/require-permission.decorator.js";
import { ActivitiesService } from "../activities/activities.service.js";
import type { ActivityInput } from "../activities/activities.repository.js";
import { ContactsService } from "../contacts/contacts.service.js";
import type {
  ContactInput,
  ContactMethodInput,
} from "../contacts/contacts.repository.js";
import { PursuitWorkflowsService } from "../pursuit-workflows/pursuit-workflows.service.js";
import type { LeadStage } from "./leads.repository.js";
import { LeadsService } from "./leads.service.js";

@Controller("staff")
@UseGuards(AuthGuard)
export class StaffLeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly pursuit: PursuitWorkflowsService,
    private readonly activities: ActivitiesService,
    private readonly contacts: ContactsService,
  ) {}

  @Get("my-work")
  async myWork(@Req() request: AuthenticatedRequest) {
    return { success: true, data: await this.leads.myWork(request.user!.id) };
  }

  @Get("lead-pool")
  @UseGuards(PermissionGuard)
  @RequirePermission("leads.claim")
  async pool(@Req() request: AuthenticatedRequest) { return { success: true, data: await this.leads.availablePool(request.user!.id) }; }

  @Post("lead-pool/:id/claim")
  @UseGuards(PermissionGuard)
  @RequirePermission("leads.claim")
  async claim(@Param("id") id:string,@Req() request:AuthenticatedRequest,@Headers("user-agent") userAgent?:string){ return {success:true,data:await this.leads.claimLead(id,request.user!.id,this.context(request,userAgent))}; }

  @Get("leads/:id")
  async get(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return {
      success: true,
      data: await this.leads.getOwned(id, request.user!.id),
    };
  }

  @Get("leads/:id/assignments")
  async history(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    await this.leads.getOwned(id, request.user!.id);
    return { success: true, data: await this.leads.assignments(id) };
  }

  @Get("leads/:id/tasks")
  async tasks(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return {
      success: true,
      data: await this.leads.ownedLeadTasks(id, request.user!.id),
    };
  }

  @Post("leads/:id/stage")
  async stage(
    @Param("id") id: string,
    @Body() body: { stage: LeadStage; reason?: string | null },
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.leads.changeStage(
        id,
        body.stage,
        this.context(request, userAgent),
        request.user!.id,
        body.reason,
      ),
    };
  }

  @Get("leads/:id/pursuit")
  async getPursuit(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.leads.getOwned(id, request.user!.id);
    return { success: true, data: await this.pursuit.getLeadPursuit(id) };
  }

  @Patch("leads/:id/pursuit/steps/:stepId")
  async step(
    @Param("id") id: string,
    @Param("stepId") stepId: string,
    @Body() body: { completed: boolean; notes?: string | null },
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    await this.leads.getOwned(id, request.user!.id);
    return {
      success: true,
      data: await this.pursuit.updateStep(
        id,
        stepId,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Post("leads/:id/pursuit/steps/:stepId/evidence")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  async evidence(
    @Param("id") id: string,
    @Param("stepId") stepId: string,
    @UploadedFile()
    file:
      | { originalname: string; mimetype: string; size: number; buffer: Buffer }
      | undefined,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    await this.leads.getOwned(id, request.user!.id);
    return {
      success: true,
      data: await this.pursuit.evidence(
        id,
        stepId,
        file,
        this.context(request, userAgent),
      ),
    };
  }

  @Post("leads/:id/pursuit/custom-steps")
  async createCustomPursuitStep(
    @Param("id") id: string,
    @Body()
    body: {
      title: string;
      description?: string | null;
      afterStepId?: string | null;
    },
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    await this.leads.getOwned(id, request.user!.id);

    return {
      success: true,
      data: await this.pursuit.addCustomStep(
        id,
        body,
        "STAFF_CUSTOM",
        this.context(request, userAgent),
      ),
    };
  }

  @Patch("leads/:id/pursuit/custom-steps/:stepId")
  async updateCustomPursuitStep(
    @Param("id") id: string,
    @Param("stepId") stepId: string,
    @Body()
    body: {
      title: string;
      description?: string | null;
    },
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    await this.leads.getOwned(id, request.user!.id);

    return {
      success: true,
      data: await this.pursuit.updateStaffCustomStep(
        id,
        stepId,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Delete("leads/:id/pursuit/custom-steps/:stepId")
  async deleteCustomPursuitStep(
    @Param("id") id: string,
    @Param("stepId") stepId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    await this.leads.getOwned(id, request.user!.id);

    return {
      success: true,
      data: await this.pursuit.deleteStaffCustomStep(
        id,
        stepId,
        this.context(request, userAgent),
      ),
    };
  }

  @Get("leads/:id/activities")
  async listActivities(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.leads.getOwned(id, request.user!.id);
    return { success: true, data: await this.activities.listForLead(id) };
  }

  @Post("leads/:id/activities")
  async createActivity(
    @Param("id") id: string,
    @Body() body: Partial<ActivityInput>,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    const lead = await this.leads.getOwned(id, request.user!.id);
    return {
      success: true,
      data: await this.activities.create(
        {
          ...body,
          leadId: id,
          organizationId: lead.organization_id,
          assignedToId: request.user!.id,
        },
        this.context(request, userAgent),
      ),
    };
  }

  @Get("follow-ups")
  async followUps(@Req() request: AuthenticatedRequest) {
    return {
      success: true,
      data: await this.activities.listFollowUps(request.user!.id),
    };
  }

  @Patch("activities/:activityId")
  async updateActivity(
    @Param("activityId") activityId: string,
    @Body() body: Partial<ActivityInput>,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    return {
      success: true,
      data: await this.activities.updateOwned(
        activityId,
        body,
        request.user!.id,
        this.context(request, userAgent),
      ),
    };
  }

  @Get("leads/:id/contacts")
  async listContacts(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const lead = await this.leads.getOwned(id, request.user!.id);
    return {
      success: true,
      data: await this.contacts.listByOrganization(lead.organization_id),
    };
  }

  @Post("leads/:id/contacts")
  async createContact(
    @Param("id") id: string,
    @Body() body: Partial<ContactInput>,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    const lead = await this.leads.getOwned(id, request.user!.id);
    return {
      success: true,
      data: await this.contacts.create(
        { ...body, organizationId: lead.organization_id },
        this.context(request, userAgent),
      ),
    };
  }

  @Patch("leads/:id/contacts/:contactId")
  async updateContact(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Body() body: Partial<ContactInput>,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    const lead = await this.leads.getOwned(id, request.user!.id);
    await this.assertContactBelongsToOrganization(
      contactId,
      lead.organization_id,
    );
    return {
      success: true,
      data: await this.contacts.update(
        contactId,
        { ...body, organizationId: lead.organization_id },
        this.context(request, userAgent),
      ),
    };
  }

  @Post("leads/:id/contacts/:contactId/methods")
  async createMethod(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Body() body: Partial<ContactMethodInput>,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    const lead = await this.leads.getOwned(id, request.user!.id);
    await this.assertContactBelongsToOrganization(
      contactId,
      lead.organization_id,
    );

    return {
      success: true,
      data: await this.contacts.createMethod(
        contactId,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Get("leads/:id/contacts/:contactId/methods")
  async listMethods(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const lead = await this.leads.getOwned(id, request.user!.id);
    await this.assertContactBelongsToOrganization(
      contactId,
      lead.organization_id,
    );
    return { success: true, data: await this.contacts.listMethods(contactId) };
  }

  @Patch("leads/:id/contacts/:contactId/methods/:methodId")
  async updateMethod(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Param("methodId") methodId: string,
    @Body() body: Partial<ContactMethodInput>,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    const lead = await this.leads.getOwned(id, request.user!.id);
    await this.assertContactBelongsToOrganization(
      contactId,
      lead.organization_id,
    );
    return {
      success: true,
      data: await this.contacts.updateMethod(
        contactId,
        methodId,
        body,
        this.context(request, userAgent),
      ),
    };
  }

  @Delete("leads/:id/contacts/:contactId/methods/:methodId")
  async deleteMethod(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Param("methodId") methodId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("user-agent") userAgent?: string,
  ) {
    const lead = await this.leads.getOwned(id, request.user!.id);
    await this.assertContactBelongsToOrganization(
      contactId,
      lead.organization_id,
    );
    return {
      success: true,
      data: await this.contacts.deleteMethod(
        contactId,
        methodId,
        this.context(request, userAgent),
      ),
    };
  }

  private async assertContactBelongsToOrganization(
    contactId: string,
    organizationId: string,
  ) {
    const contact = await this.contacts.get(contactId);
    if (contact.organization_id !== organizationId) {
      throw new NotFoundException("Contact not found");
    }
  }

  private context(request: AuthenticatedRequest, userAgent?: string) {
    return {
      actorUserId: request.user!.id,
      ipAddress: request.ip,
      userAgent,
    };
  }
}
