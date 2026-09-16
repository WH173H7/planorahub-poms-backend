import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { PermissionGuard } from '../permissions/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { InvoicesService } from './invoices.service.js';

@Controller('invoices')
@UseGuards(AuthGuard, PermissionGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  @RequirePermission('invoices.read')
  async list(@Query('status') status?: string, @Query('q') q?: string) {
    return { success: true, data: await this.service.list({ status, q }) };
  }

  @Get('options')
  @RequirePermission('invoices.read')
  async options() { return { success: true, data: await this.service.options() }; }

  @Get('settings')
  @RequirePermission('invoices.read')
  async settings() { return { success: true, data: await this.service.settings() }; }

  @Patch('settings')
  @RequirePermission('invoices.manage')
  async updateSettings(@Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.updateSettings(body, this.ctx(req, ua)) };
  }

  @Post('tax-rates')
  @RequirePermission('invoices.manage')
  async createTaxRate(@Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.createTaxRate(body, this.ctx(req, ua)) };
  }

  @Patch('tax-rates/:taxId')
  @RequirePermission('invoices.manage')
  async updateTaxRate(@Param('taxId') taxId: string, @Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.updateTaxRate(taxId, body, this.ctx(req, ua)) };
  }

  @Post()
  @RequirePermission('invoices.create')
  async create(@Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.create(body, this.ctx(req, ua)) };
  }

  @Get(':id')
  @RequirePermission('invoices.read')
  async get(@Param('id') id: string) { return { success: true, data: await this.service.get(id) }; }

  @Patch(':id')
  @RequirePermission('invoices.create')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.update(id, body, this.ctx(req, ua)) };
  }

  @Post(':id/send')
  @RequirePermission('invoices.send')
  async send(@Param('id') id: string, @Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.sendInvoice(id, body, this.ctx(req, ua)) };
  }

  @Post(':id/remind')
  @RequirePermission('invoices.send')
  async remind(@Param('id') id: string, @Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.remind(id, body, this.ctx(req, ua)) };
  }

  @Post(':id/payments')
  @RequirePermission('invoices.record_payment')
  async payment(@Param('id') id: string, @Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.recordPayment(id, body, this.ctx(req, ua)) };
  }

  @Post(':id/payments/:paymentId/review')
  @RequirePermission('invoices.approve_payment')
  async reviewPayment(@Param('id') id: string, @Param('paymentId') paymentId: string, @Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.reviewPayment(id, paymentId, body, this.ctx(req, ua)) };
  }

  @Post(':id/payments/:paymentId/receipt')
  @RequirePermission('invoices.record_payment')
  async receipt(@Param('id') id: string, @Param('paymentId') paymentId: string, @Body() body: any, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.sendReceipt(id, paymentId, body, this.ctx(req, ua)) };
  }

  @Post(':id/void')
  @RequirePermission('invoices.manage')
  async voidInvoice(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    return { success: true, data: await this.service.voidInvoice(id, this.ctx(req, ua)) };
  }

  @Get(':id/pdf')
  @RequirePermission('invoices.read')
  async pdf(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Headers('user-agent') ua?: string) {
    const result = await this.service.pdf(id, this.ctx(req, ua));
    return new StreamableFile(result.file, { type: 'application/pdf', disposition: `attachment; filename="${result.invoiceNumber}.pdf"` });
  }

  private ctx(req: AuthenticatedRequest, userAgent?: string) {
    return { actorUserId: req.user!.id, roleCode: req.user!.roleCode, ipAddress: req.ip, userAgent };
  }
}
