import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { JobPermanentFailureError } from '../../jobs/job-permanent-failure.error';
import {
  computeGstInvoice,
  hasTaxedItems,
  resolveSupplyType,
  TaxedLineHsnSacError,
  validateGstin,
  validateStateCode,
} from '../utils/gst.util';

const MAX_INVOICE_NUMBER_RETRIES = 5;

export type DraftLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  hsnSac?: string;
  gstRate: number;
  sortOrder: number;
  sourceKey: string;
};

export type DraftLineBillingResult = {
  outcome: 'created' | 'already_processed';
  invoiceId?: string;
  invoiceItemId?: string;
};

@Injectable()
export class DraftLineInvoiceBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly auditService: AuditService,
  ) {}

  private async generateInvoiceNumber(
    tx: Prisma.TransactionClient,
    hospitalId: string,
  ): Promise<string> {
    const latest = await tx.invoice.findFirst({
      where: { hospitalId },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let sequence = 1;
    if (latest?.invoiceNumber) {
      const match = /^INV-(\d+)$/.exec(latest.invoiceNumber);
      if (match) {
        sequence = parseInt(match[1], 10) + 1;
      }
    }

    return `INV-${String(sequence).padStart(6, '0')}`;
  }

  async createDraftInvoiceWithLines(input: {
    hospitalId: string;
    branchId: string | null;
    patientId: string;
    lines: DraftLineInput[];
    outboxId: string;
    jobContext: { jobId: string; workerId: string };
    auditMetadata: Record<string, unknown>;
  }): Promise<DraftLineBillingResult> {
    const { hospitalId, branchId, patientId, lines, outboxId, jobContext, auditMetadata } =
      input;

    if (lines.length === 0) {
      throw new BadRequestException('At least one invoice line is required');
    }

    for (const line of lines) {
      const existing = await this.prisma.invoiceItem.findFirst({
        where: { hospitalId, sourceKey: line.sourceKey },
      });
      if (existing) {
        await this.domainEventOutboxService.markProcessedIfPending(
          outboxId,
          hospitalId,
          this.prisma,
        );
        return { outcome: 'already_processed', invoiceItemId: existing.id };
      }
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) {
      throw new BadRequestException('Hospital not found');
    }

    const itemInputs = lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      hsnSac: line.hsnSac,
      gstRate: line.gstRate,
      sortOrder: line.sortOrder,
    }));

    let placeOfSupplyStateCode: string | undefined;
    let supplyType: ReturnType<typeof resolveSupplyType> | null = null;
    let supplierGstin: string | null = null;
    let supplierStateCode: string | null = null;

    if (hasTaxedItems(itemInputs)) {
      if (!hospital.stateCode || !validateStateCode(hospital.stateCode)) {
        throw new BadRequestException(
          'Hospital GST state not configured for taxed billing',
        );
      }
      if (!hospital.gstin || !validateGstin(hospital.gstin)) {
        throw new BadRequestException(
          'Hospital GSTIN not configured for taxed billing',
        );
      }
      placeOfSupplyStateCode = hospital.stateCode;
      supplierGstin = hospital.gstin;
      supplierStateCode = hospital.stateCode;
      supplyType = resolveSupplyType(hospital.stateCode, placeOfSupplyStateCode);
    }

    let computed;
    try {
      computed = computeGstInvoice(itemInputs, hospitalId, supplyType);
    } catch (error) {
      if (error instanceof TaxedLineHsnSacError) {
        throw new JobPermanentFailureError(error.message);
      }
      throw error;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const dup = await tx.invoiceItem.findFirst({
          where: { hospitalId, sourceKey: line.sourceKey },
        });
        if (dup) {
          await this.domainEventOutboxService.markProcessedIfPending(
            outboxId,
            hospitalId,
            tx,
          );
          return {
            outcome: 'already_processed' as const,
            invoiceItemId: dup.id,
          };
        }
      }

      let invoiceId: string | undefined;

      for (let attempt = 0; attempt < MAX_INVOICE_NUMBER_RETRIES; attempt += 1) {
        try {
          const invoiceNumber = await this.generateInvoiceNumber(tx, hospitalId);
          const invoice = await tx.invoice.create({
            data: {
              hospitalId,
              branchId,
              patientId,
              invoiceNumber,
              status: InvoiceStatus.DRAFT,
              currency: 'INR',
              subtotalAmount: computed.subtotalAmount,
              cgstAmount: computed.cgstAmount,
              sgstAmount: computed.sgstAmount,
              igstAmount: computed.igstAmount,
              taxAmount: computed.taxAmount,
              totalAmount: computed.totalAmount,
              supplierGstin,
              supplierStateCode,
              placeOfSupplyStateCode: placeOfSupplyStateCode ?? null,
              supplyType,
              items: {
                create: computed.computedItems.map((item, index) => ({
                  ...item,
                  sourceKey: lines[index]!.sourceKey,
                })),
              },
            },
            include: { items: true },
          });
          invoiceId = invoice.id;
          break;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            attempt < MAX_INVOICE_NUMBER_RETRIES - 1
          ) {
            const target = error.meta?.target;
            if (
              Array.isArray(target) &&
              target.includes('hospitalId') &&
              target.includes('sourceKey')
            ) {
              const dup = await tx.invoiceItem.findFirst({
                where: { hospitalId, sourceKey: lines[0]!.sourceKey },
              });
              await this.domainEventOutboxService.markProcessedIfPending(
                outboxId,
                hospitalId,
                tx,
              );
              return {
                outcome: 'already_processed' as const,
                invoiceItemId: dup?.id,
              };
            }
            continue;
          }
          throw error;
        }
      }

      if (!invoiceId) {
        throw new BadRequestException('Could not create draft invoice');
      }

      await this.domainEventOutboxService.markProcessedIfPending(
        outboxId,
        hospitalId,
        tx,
      );

      return { outcome: 'created' as const, invoiceId };
    });

    if (result.outcome === 'created' && result.invoiceId) {
      await this.auditService.log({
        action: 'INVOICE_CREATED',
        entity: 'Invoice',
        entityId: result.invoiceId,
        hospitalId,
        branchId,
        userId: null,
        metadata: {
          source: 'department_billing_job',
          jobId: jobContext.jobId,
          workerId: jobContext.workerId,
          lineCount: lines.length,
          ...auditMetadata,
        },
      });
    }

    return result;
  }
}
