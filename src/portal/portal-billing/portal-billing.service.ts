import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentPayerType, PaymentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PaymentsService } from '../../billing/payments.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PATIENT_PORTAL_INVOICE_VIEWED,
  PATIENT_PORTAL_PAYMENT_INITIATED,
  PATIENT_PORTAL_PAYMENT_VIEWED,
} from '../portal-audit.actions';
import { PatientPrincipal } from '../portal.types';
import { PortalInvoiceQueryDto } from './dto/portal-invoice-query.dto';
import {
  mapPortalInvoiceDetail,
  mapPortalInvoiceSummary,
  mapPortalPayment,
  mapPortalPaymentInitiation,
} from './portal-billing.response.mapper';

const invoiceInclude = {
  items: {
    orderBy: { sortOrder: 'asc' as const },
  },
} as const;

@Injectable()
export class PortalBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly auditService: AuditService,
  ) {}

  private portalPaymentUser(principal: PatientPrincipal) {
    return {
      sub: principal.patientId,
      hospitalId: principal.hospitalId,
      branchId: null as string | null,
      auditUserId: null as null,
    };
  }

  private async sumSucceededPaymentsByInvoice(
    invoiceIds: string[],
  ): Promise<Map<string, Prisma.Decimal>> {
    if (invoiceIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.payment.groupBy({
      by: ['invoiceId'],
      where: {
        invoiceId: { in: invoiceIds },
        status: PaymentStatus.SUCCEEDED,
        payerType: PaymentPayerType.PATIENT,
      },
      _sum: { amount: true },
    });

    const map = new Map<string, Prisma.Decimal>();
    for (const row of rows) {
      map.set(row.invoiceId, row._sum.amount ?? new Prisma.Decimal(0));
    }
    return map;
  }

  async listInvoices(principal: PatientPrincipal, query: PortalInvoiceQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 50, 100);

    const where: Prisma.InvoiceWhereInput = {
      hospitalId: principal.hospitalId,
      patientId: principal.patientId,
      ...(query.status !== undefined && { status: query.status }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const paidByInvoice = await this.sumSucceededPaymentsByInvoice(
      rows.map((row) => row.id),
    );

    await this.auditService.log({
      action: PATIENT_PORTAL_INVOICE_VIEWED,
      entity: 'Patient',
      entityId: principal.patientId,
      hospitalId: principal.hospitalId,
      branchId: principal.branchId,
      metadata: { section: 'invoice_list' },
    });

    return {
      data: rows.map((invoice) =>
        mapPortalInvoiceSummary(
          invoice,
          paidByInvoice.get(invoice.id) ?? new Prisma.Decimal(0),
        ),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getInvoice(principal: PatientPrincipal, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        hospitalId: principal.hospitalId,
        patientId: principal.patientId,
      },
      include: invoiceInclude,
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const paidRows = await this.sumSucceededPaymentsByInvoice([invoice.id]);
    const paid = paidRows.get(invoice.id) ?? new Prisma.Decimal(0);

    await this.auditService.log({
      action: PATIENT_PORTAL_INVOICE_VIEWED,
      entity: 'Invoice',
      entityId: invoice.id,
      hospitalId: principal.hospitalId,
      branchId: invoice.branchId,
      metadata: { section: 'invoice_detail' },
    });

    return mapPortalInvoiceDetail(invoice, paid);
  }

  async getPayment(principal: PatientPrincipal, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        hospitalId: principal.hospitalId,
        invoice: {
          patientId: principal.patientId,
          hospitalId: principal.hospitalId,
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.auditService.log({
      action: PATIENT_PORTAL_PAYMENT_VIEWED,
      entity: 'Payment',
      entityId: payment.id,
      hospitalId: principal.hospitalId,
      branchId: payment.branchId,
      metadata: { invoiceId: payment.invoiceId },
    });

    return mapPortalPayment(payment);
  }

  async initiateInvoicePayment(principal: PatientPrincipal, invoiceId: string) {
    const owned = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        hospitalId: principal.hospitalId,
        patientId: principal.patientId,
      },
      select: { id: true },
    });

    if (!owned) {
      throw new NotFoundException('Invoice not found');
    }

    const result = await this.paymentsService.initiatePayment(
      this.portalPaymentUser(principal),
      invoiceId,
    );

    await this.auditService.log({
      action: PATIENT_PORTAL_PAYMENT_INITIATED,
      entity: 'Payment',
      entityId: result.paymentId,
      hospitalId: principal.hospitalId,
      branchId: principal.branchId,
      metadata: { invoiceId },
    });

    return mapPortalPaymentInitiation(result);
  }

}
