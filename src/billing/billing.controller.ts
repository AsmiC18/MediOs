import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PaymentsService } from './payments.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateInvoiceDto) {
    return this.billingService.create(req.user, dto);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: InvoiceQueryDto) {
    return this.billingService.findAll(req.user, query);
  }

  @Post(':id/payment')
  initiatePayment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() _dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(req.user, id);
  }

  @Get(':id/payments')
  listPayments(@Request() req: any, @Param('id') id: string) {
    return this.paymentsService.listPaymentsForInvoice(req.user, id);
  }

  @Get(':id/reconciliation')
  getReconciliation(@Request() req: any, @Param('id') id: string) {
    return this.billingService.getReconciliation(req.user, id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.billingService.findOne(req.user, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.billingService.updateStatus(req.user, id, dto);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.billingService.update(req.user, id, dto);
  }
}
