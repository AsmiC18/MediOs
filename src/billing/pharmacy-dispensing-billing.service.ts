import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DomainEventOutbox,
  InvoiceStatus,
  PharmacyDispensingStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import {
  PHARMACY_DISPENSING_BILLING_EVENT_TYPE,
  PharmacyDispensingBillingEventPayload,
  pharmacyDispensingItemSourceKey,
} from './pharmacy-dispensing-billing-event.util';
import {
  computeGstInvoice,
  hasTaxedItems,
  resolveSupplyType,
  TaxedLineHsnSacError,
  validateGstin,
  validateStateCode,
} from './utils/gst.util';

const MAX_INVOICE_NUMBER_RETRIES = 5;

export type PharmacyDispensingBillingResult = {
  outcome: 'created' | 'already_processed' | 'skipped';
  invoiceId?: string;
};

@Injectable()
export class PharmacyDispensingBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly auditService: AuditService,
  ) {}

  private parsePayload(
    outbox: DomainEventOutbox,
  ): PharmacyDispensingBillingEventPayload {
    const payload = outbox.payload as PharmacyDispensingBillingEventPayload;
    if (!payload?.dispensingId || !payload?.patientId) {
      throw new JobPermanentFailureError(
        'Invalid pharmacy dispensing billing event payload',
      );
    }
    return payload;
  }

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

  async processOutboxEvent(
    hospitalId: string,
    outboxId: string,
    jobContext: { jobId: string; workerId: string },
  ): Promise<PharmacyDispensingBillingResult> {
    const outbox = await this.domainEventOutboxService.findByIdForHospital(
      outboxId,
      hospitalId,
    );

    if (!outbox) {
      throw new NotFoundException('Outbox event not found for hospital');
    }

    if (outbox.eventType !== PHARMACY_DISPENSING_BILLING_EVENT_TYPE) {
      throw new JobPermanentFailureError(
        `Unexpected outbox event type: ${outbox.eventType}`,
      );
    }

    const payload = this.parsePayload(outbox);

    const dispensing = await this.prisma.pharmacyDispensing.findFirst({
      where: {
        id: payload.dispensingId,
        hospitalId,
        patientId: payload.patientId,
        status: PharmacyDispensingStatus.DISPENSED,
      },
      include: {
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
    });

    if (!dispensing) {
      throw new JobPermanentFailureError(
        'Dispensing not found or not billable for hospital',
      );
    }

    if (dispensing.items.length === 0) {
      await this.domainEventOutboxService.markProcessedIfPending(
        outboxId,
        hospitalId,
        this.prisma,
      );
      return { outcome: 'skipped' };
    }

    const existingAny = await this.prisma.invoiceItem.findFirst({
      where: {
        hospitalId,
        sourceKey: pharmacyDispensingItemSourceKey(dispensing.items[0].id),
      },
    });

    if (existingAny) {
      await this.domainEventOutboxService.markProcessedIfPending(
        outboxId,
        hospitalId,
        this.prisma,
      );
      return { outcome: 'already_processed', invoiceId: existingAny.invoiceId };
    }

    const lineItems = dispensing.items.map((item, index) => ({
      description: `Pharmacy: ${item.product.name}`,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      gstRate: 0,
      sortOrder: index,
      sourceKey: pharmacyDispensingItemSourceKey(item.id),
    }));

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });

    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    let supplyType: ReturnType<typeof resolveSupplyType> | null = null;
    let supplierGstin: string | null = null;
    let supplierStateCode: string | null = null;
    let placeOfSupplyStateCode: string | null = null;

    if (hasTaxedItems(lineItems)) {
      if (!hospital.stateCode || !validateStateCode(hospital.stateCode)) {
        throw new JobPermanentFailureError(
          'Hospital GST state not configured for taxed pharmacy billing',
        );
      }
      if (!hospital.gstin || !validateGstin(hospital.gstin)) {
        throw new JobPermanentFailureError(
          'Hospital GSTIN not configured for taxed pharmacy billing',
        );
      }
      placeOfSupplyStateCode = hospital.stateCode;
      supplierGstin = hospital.gstin;
      supplierStateCode = hospital.stateCode;
      supplyType = resolveSupplyType(hospital.stateCode, placeOfSupplyStateCode);
    }

    let computed;
    try {
      computed = computeGstInvoice(lineItems, hospitalId, supplyType);
    } catch (error) {
      if (error instanceof TaxedLineHsnSacError) {
        throw new JobPermanentFailureError(error.message);
      }
      throw error;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const line of lineItems) {
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
            invoiceId: dup.invoiceId,
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
              branchId: dispensing.branchId,
              patientId: dispensing.patientId,
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
              placeOfSupplyStateCode,
              supplyType,
              items: {
                create: computed.computedItems.map((item, index) => ({
                  ...item,
                  sourceKey: lineItems[index].sourceKey,
                })),
              },
            },
          });
          invoiceId = invoice.id;
          break;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            attempt < MAX_INVOICE_NUMBER_RETRIES - 1
          ) {
            continue;
          }
          throw error;
        }
      }

      if (!invoiceId) {
        throw new BadRequestException('Could not create pharmacy invoice');
      }

      await this.domainEventOutboxService.markProcessedIfPending(
        outboxId,
        hospitalId,
        tx,
      );

      return { outcome: 'created' as const, invoiceId };
    });

    if (result.outcome === 'created') {
      await this.auditService.log({
        action: 'INVOICE_CREATED',
        entity: 'Invoice',
        entityId: result.invoiceId,
        hospitalId,
        branchId: dispensing.branchId,
        userId: null,
        metadata: {
          source: 'pharmacy_dispensing_billing_job',
          jobId: jobContext.jobId,
          workerId: jobContext.workerId,
          dispensingId: dispensing.id,
          itemCount: dispensing.items.length,
          totalAmount: computed.totalAmount.toString(),
        },
      });
    }

    return result;
  }
}
