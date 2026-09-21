import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GstSupplyType,
  Hospital,
  Invoice,
  InvoiceStatus,
  Patient,
  PaymentStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { CreateInvoiceItemDto } from './dto/create-invoice-item.dto';
import {
  computeGstInvoice,
  GstItemInput,
  hasTaxedItems,
  resolveSupplyType,
  validateGstin,
  validateStateCode,
} from './utils/gst.util';
import { roundMoney } from './utils/money.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_INVOICE_NUMBER_RETRIES = 3;

const ALLOWED_STATUS_TRANSITIONS: Partial<
  Record<InvoiceStatus, InvoiceStatus[]>
> = {
  [InvoiceStatus.DRAFT]: [InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED],
  [InvoiceStatus.ISSUED]: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED],
};

const invoiceInclude = {
  items: {
    orderBy: {
      sortOrder: 'asc' as const,
    },
  },
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
} as const;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async validateBranch(
    user: AuthenticatedUser,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        'Branch does not belong to your hospital',
      );
    }
  }

  private async findOwnedPatient(
    user: AuthenticatedUser,
    patientId: string,
  ): Promise<Patient> {
    const patient = await this.prisma.patient.findUnique({
      where: {
        id: patientId,
      },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  private assertPatientIsActive(patient: Patient): void {
    if (patient.mergedIntoPatientId) {
      throw new BadRequestException(
        'Patient has been merged and cannot be invoiced',
      );
    }
  }

  private async findOwnedInvoice(
    user: AuthenticatedUser,
    invoiceId: string,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        hospitalId: user.hospitalId,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  private async findOwnedHospital(hospitalId: string): Promise<Hospital> {
    const hospital = await this.prisma.hospital.findUnique({
      where: {
        id: hospitalId,
      },
    });

    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    return hospital;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private validateHospitalGstConfig(
    hospital: Hospital,
    items: GstItemInput[],
  ): void {
    if (!hasTaxedItems(items)) {
      return;
    }

    if (!hospital.stateCode) {
      throw new BadRequestException('Hospital GST state not configured');
    }

    if (!validateStateCode(hospital.stateCode)) {
      throw new BadRequestException('Hospital GST state not configured');
    }

    if (!hospital.gstin) {
      throw new BadRequestException('Hospital GSTIN not configured');
    }

    if (!validateGstin(hospital.gstin)) {
      throw new BadRequestException('Hospital GSTIN not configured');
    }
  }

  private resolveTaxContext(
    hospital: Hospital,
    items: GstItemInput[],
    placeOfSupplyStateCode?: string,
  ): {
    supplierGstin: string | null;
    supplierStateCode: string | null;
    placeOfSupplyStateCode: string | null;
    supplyType: GstSupplyType | null;
  } {
    if (!hasTaxedItems(items)) {
      return {
        supplierGstin: null,
        supplierStateCode: null,
        placeOfSupplyStateCode: placeOfSupplyStateCode ?? null,
        supplyType: null,
      };
    }

    if (!placeOfSupplyStateCode) {
      throw new BadRequestException(
        'placeOfSupplyStateCode is required when any item has GST',
      );
    }

    if (!validateStateCode(placeOfSupplyStateCode)) {
      throw new BadRequestException(
        'placeOfSupplyStateCode must be a valid 2-digit GST state code',
      );
    }

    this.validateHospitalGstConfig(hospital, items);

    return {
      supplierGstin: hospital.gstin,
      supplierStateCode: hospital.stateCode,
      placeOfSupplyStateCode,
      supplyType: resolveSupplyType(
        hospital.stateCode!,
        placeOfSupplyStateCode,
      ),
    };
  }

  private buildTaxAuditMetadata(invoice: {
    taxAmount: Prisma.Decimal;
    cgstAmount: Prisma.Decimal;
    sgstAmount: Prisma.Decimal;
    igstAmount: Prisma.Decimal;
    supplyType: GstSupplyType | null;
  }) {
    return {
      taxAmount: invoice.taxAmount.toString(),
      cgstAmount: invoice.cgstAmount.toString(),
      sgstAmount: invoice.sgstAmount.toString(),
      igstAmount: invoice.igstAmount.toString(),
      supplyType: invoice.supplyType,
    };
  }

  private async generateInvoiceNumber(
    tx: Prisma.TransactionClient,
    hospitalId: string,
  ): Promise<string> {
    const latest = await tx.invoice.findFirst({
      where: {
        hospitalId,
      },
      orderBy: {
        invoiceNumber: 'desc',
      },
      select: {
        invoiceNumber: true,
      },
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

  private assertDraftEditable(invoice: Invoice): void {
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictException('Only draft invoices can be edited');
    }
  }

  async create(user: AuthenticatedUser, dto: CreateInvoiceDto) {
    const patient = await this.findOwnedPatient(user, dto.patientId);
    this.assertPatientIsActive(patient);

    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
    }

    const hospital = await this.findOwnedHospital(user.hospitalId);
    const taxContext = this.resolveTaxContext(
      hospital,
      dto.items,
      dto.placeOfSupplyStateCode,
    );
    const computed = computeGstInvoice(
      dto.items,
      user.hospitalId,
      taxContext.supplyType,
    );

    let invoice;

    for (let attempt = 0; attempt < MAX_INVOICE_NUMBER_RETRIES; attempt += 1) {
      try {
        invoice = await this.prisma.$transaction(async (tx) => {
          const invoiceNumber = await this.generateInvoiceNumber(
            tx,
            user.hospitalId,
          );

          return tx.invoice.create({
            data: {
              hospitalId: user.hospitalId,
              branchId: dto.branchId,
              patientId: dto.patientId,
              invoiceNumber,
              status: InvoiceStatus.DRAFT,
              currency: 'INR',
              subtotalAmount: computed.subtotalAmount,
              cgstAmount: computed.cgstAmount,
              sgstAmount: computed.sgstAmount,
              igstAmount: computed.igstAmount,
              taxAmount: computed.taxAmount,
              totalAmount: computed.totalAmount,
              supplierGstin: taxContext.supplierGstin,
              supplierStateCode: taxContext.supplierStateCode,
              placeOfSupplyStateCode: taxContext.placeOfSupplyStateCode,
              supplyType: taxContext.supplyType,
              notes: dto.notes,
              items: {
                create: computed.computedItems,
              },
            },
            include: invoiceInclude,
          });
        });

        break;
      } catch (error) {
        if (
          this.isUniqueConstraintViolation(error) &&
          attempt < MAX_INVOICE_NUMBER_RETRIES - 1
        ) {
          continue;
        }

        if (this.isUniqueConstraintViolation(error)) {
          throw new ConflictException(
            'Could not generate a unique invoice number',
          );
        }

        throw error;
      }
    }

    if (!invoice) {
      throw new ConflictException('Could not generate a unique invoice number');
    }

    await this.auditService.log({
      action: 'INVOICE_CREATED',
      entity: 'Invoice',
      entityId: invoice.id,
      hospitalId: user.hospitalId,
      branchId: invoice.branchId,
      userId: user.sub,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        patientId: invoice.patientId,
        itemCount: invoice.items.length,
        subtotalAmount: invoice.subtotalAmount.toString(),
        totalAmount: invoice.totalAmount.toString(),
        ...this.buildTaxAuditMetadata(invoice),
      },
    });

    return invoice;
  }

  async findAll(user: AuthenticatedUser, query: InvoiceQueryDto = {}) {
    if (query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    if (query.patientId) {
      await this.findOwnedPatient(user, query.patientId);
    }

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where: Prisma.InvoiceWhereInput = {
      hospitalId: user.hospitalId,
      ...(query.patientId !== undefined && { patientId: query.patientId }),
      ...(query.status !== undefined && { status: query.status }),
      ...(query.branchId !== undefined && { branchId: query.branchId }),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findOne(user: AuthenticatedUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        hospitalId: user.hospitalId,
      },
      include: invoiceInclude,
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async update(
    user: AuthenticatedUser,
    invoiceId: string,
    dto: UpdateInvoiceDto,
  ) {
    const existing = await this.findOwnedInvoice(user, invoiceId);
    this.assertDraftEditable(existing);

    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
    }

    const hospital = await this.findOwnedHospital(user.hospitalId);

    const updatedInvoice = await this.prisma.$transaction(async (tx) => {
      const nextItems: CreateInvoiceItemDto[] = dto.items
        ? dto.items
        : (
            await tx.invoiceItem.findMany({
              where: { invoiceId },
              orderBy: { sortOrder: 'asc' },
            })
          ).map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toNumber(),
            hsnSac: item.hsnSac ?? undefined,
            gstRate: item.gstRate.toNumber(),
            sortOrder: item.sortOrder,
          }));

      const nextPlaceOfSupply =
        dto.placeOfSupplyStateCode ?? existing.placeOfSupplyStateCode ?? undefined;

      const taxContext = this.resolveTaxContext(
        hospital,
        nextItems,
        nextPlaceOfSupply,
      );
      const computed = computeGstInvoice(
        nextItems,
        user.hospitalId,
        taxContext.supplyType,
      );

      if (dto.items) {
        await tx.invoiceItem.deleteMany({
          where: {
            invoiceId,
          },
        });
      }

      return tx.invoice.update({
        where: {
          id: invoiceId,
        },
        data: {
          ...(dto.branchId !== undefined && { branchId: dto.branchId }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.placeOfSupplyStateCode !== undefined && {
            placeOfSupplyStateCode: taxContext.placeOfSupplyStateCode,
          }),
          ...(dto.items !== undefined && {
            supplierGstin: taxContext.supplierGstin,
            supplierStateCode: taxContext.supplierStateCode,
            placeOfSupplyStateCode: taxContext.placeOfSupplyStateCode,
            supplyType: taxContext.supplyType,
            subtotalAmount: computed.subtotalAmount,
            cgstAmount: computed.cgstAmount,
            sgstAmount: computed.sgstAmount,
            igstAmount: computed.igstAmount,
            taxAmount: computed.taxAmount,
            totalAmount: computed.totalAmount,
            items: {
              create: computed.computedItems,
            },
          }),
          ...(dto.placeOfSupplyStateCode !== undefined &&
            dto.items === undefined && {
              supplierGstin: taxContext.supplierGstin,
              supplierStateCode: taxContext.supplierStateCode,
              placeOfSupplyStateCode: taxContext.placeOfSupplyStateCode,
              supplyType: taxContext.supplyType,
              subtotalAmount: computed.subtotalAmount,
              cgstAmount: computed.cgstAmount,
              sgstAmount: computed.sgstAmount,
              igstAmount: computed.igstAmount,
              taxAmount: computed.taxAmount,
              totalAmount: computed.totalAmount,
            }),
        },
        include: invoiceInclude,
      });
    });

    await this.auditService.log({
      action: 'INVOICE_UPDATED',
      entity: 'Invoice',
      entityId: updatedInvoice.id,
      hospitalId: user.hospitalId,
      branchId: updatedInvoice.branchId,
      userId: user.sub,
      metadata: {
        invoiceNumber: updatedInvoice.invoiceNumber,
        itemCount: updatedInvoice.items.length,
        subtotalAmount: updatedInvoice.subtotalAmount.toString(),
        totalAmount: updatedInvoice.totalAmount.toString(),
        ...this.buildTaxAuditMetadata(updatedInvoice),
      },
    });

    return updatedInvoice;
  }

  async updateStatus(
    user: AuthenticatedUser,
    invoiceId: string,
    dto: UpdateInvoiceStatusDto,
  ) {
    const existing = await this.findOwnedInvoice(user, invoiceId);
    const allowedTargets =
      ALLOWED_STATUS_TRANSITIONS[existing.status] ?? [];

    if (!allowedTargets.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition invoice from ${existing.status} to ${dto.status}`,
      );
    }

    const now = new Date();

    const updatedInvoice = await this.prisma.invoice.update({
      where: {
        id: invoiceId,
      },
      data: {
        status: dto.status,
        ...(dto.status === InvoiceStatus.ISSUED && { issuedAt: now }),
        ...(dto.status === InvoiceStatus.PAID && { paidAt: now }),
      },
      include: invoiceInclude,
    });

    const statusMetadata: Prisma.InputJsonObject = {
      from: existing.status,
      to: dto.status,
    };

    if (dto.status === InvoiceStatus.ISSUED) {
      Object.assign(statusMetadata, this.buildTaxAuditMetadata(updatedInvoice));
    }

    await this.auditService.log({
      action: 'INVOICE_STATUS_CHANGED',
      entity: 'Invoice',
      entityId: updatedInvoice.id,
      hospitalId: user.hospitalId,
      branchId: updatedInvoice.branchId,
      userId: user.sub,
      metadata: statusMetadata,
    });

    return updatedInvoice;
  }

  async getReconciliation(user: AuthenticatedUser, invoiceId: string) {
    const invoice = await this.findOwnedInvoice(user, invoiceId);
    const invoiceTotal = roundMoney(invoice.totalAmount);

    const payments = await this.prisma.payment.findMany({
      where: {
        invoiceId,
        hospitalId: user.hospitalId,
        status: PaymentStatus.SUCCEEDED,
      },
      select: {
        id: true,
        amount: true,
      },
    });

    const paymentIds = payments.map((payment) => payment.id);

    const successfulPayments = roundMoney(
      payments.reduce(
        (sum, payment) => sum.add(roundMoney(payment.amount)),
        new Prisma.Decimal(0),
      ),
    );

    const refunds =
      paymentIds.length > 0
        ? await this.prisma.refund.findMany({
            where: {
              paymentId: {
                in: paymentIds,
              },
              hospitalId: user.hospitalId,
              status: RefundStatus.SUCCEEDED,
            },
            select: {
              amount: true,
            },
          })
        : [];

    const successfulRefunds = roundMoney(
      refunds.reduce(
        (sum, refund) => sum.add(roundMoney(refund.amount)),
        new Prisma.Decimal(0),
      ),
    );

    const netCollected = roundMoney(
      successfulPayments.sub(successfulRefunds),
    );
    const outstanding = roundMoney(
      Prisma.Decimal.max(invoiceTotal.sub(successfulPayments), 0),
    );
    const mismatch = roundMoney(invoiceTotal.sub(successfulPayments));

    return {
      invoiceId: invoice.id,
      invoiceTotal: invoiceTotal.toFixed(2),
      successfulPayments: successfulPayments.toFixed(2),
      successfulRefunds: successfulRefunds.toFixed(2),
      netCollected: netCollected.toFixed(2),
      outstanding: outstanding.toFixed(2),
      mismatch: mismatch.toFixed(2),
    };
  }
}
