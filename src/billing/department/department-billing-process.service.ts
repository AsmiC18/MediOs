import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiagnosticOrderStatus,
  DomainEventOutbox,
  IpdAdmissionStatus,
  Prisma,
} from '@prisma/client';
import { STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE } from '../../attendance/staff-attendance-consultation-event.util';
import { JobPermanentFailureError } from '../../jobs/job-permanent-failure.error';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DIAGNOSTIC_ORDER_BILLING_EVENT_TYPE,
  EMERGENCY_VISIT_BILLING_EVENT_TYPE,
  IPD_DISCHARGE_BILLING_EVENT_TYPE,
  OPD_CONSULTATION_BILLING_EVENT_TYPE,
  SURGERY_PROCEDURE_BILLING_EVENT_TYPE,
  diagnosticOrderItemBillingSourceKey,
  emergencyVisitBillingSourceKey,
  ipdDischargeBillingSourceKey,
  opdConsultationBillingSourceKey,
  surgeryProcedureBillingSourceKey,
} from './department-billing-event.util';
import { DraftLineInvoiceBillingService } from './draft-line-invoice-billing.service';

export type DepartmentBillingProcessResult = {
  outcome: 'created' | 'already_processed' | 'skipped';
  invoiceId?: string;
};

type HospitalFeeConfig = {
  unitPrice: Prisma.Decimal | null;
  hsnSac: string | null;
  gstRate: Prisma.Decimal;
};

@Injectable()
export class DepartmentBillingProcessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly draftLineBilling: DraftLineInvoiceBillingService,
  ) {}

  async processOutboxEvent(
    hospitalId: string,
    outboxId: string,
    jobContext: { jobId: string; workerId: string },
  ): Promise<DepartmentBillingProcessResult> {
    const outbox = await this.domainEventOutboxService.findByIdForHospital(
      outboxId,
      hospitalId,
    );

    if (!outbox) {
      throw new NotFoundException('Outbox event not found for hospital');
    }

    switch (outbox.eventType) {
      case OPD_CONSULTATION_BILLING_EVENT_TYPE:
      case STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE:
        return this.processConsultationBilling(outbox, outboxId, hospitalId, jobContext);
      case IPD_DISCHARGE_BILLING_EVENT_TYPE:
        return this.processIpdDischarge(outbox, outboxId, hospitalId, jobContext);
      case EMERGENCY_VISIT_BILLING_EVENT_TYPE:
        return this.processEmergencyVisit(outbox, outboxId, hospitalId, jobContext);
      case DIAGNOSTIC_ORDER_BILLING_EVENT_TYPE:
        return this.processDiagnosticOrder(outbox, outboxId, hospitalId, jobContext);
      case SURGERY_PROCEDURE_BILLING_EVENT_TYPE:
        return this.processSurgeryProcedure(outbox, outboxId, hospitalId, jobContext);
      default:
        throw new JobPermanentFailureError(
          `Unsupported department billing event type: ${outbox.eventType}`,
        );
    }
  }

  private requireFee(
    config: HospitalFeeConfig,
    label: string,
  ): { unitPrice: number; hsnSac?: string; gstRate: number } {
    if (config.unitPrice == null || config.unitPrice.lte(0)) {
      throw new JobPermanentFailureError(
        `Hospital ${label} fee is not configured`,
      );
    }
    const gstRate = config.gstRate.toNumber();
    if (gstRate > 0 && !config.hsnSac?.trim()) {
      throw new JobPermanentFailureError(
        `Hospital ${label} fee requires HSN/SAC when GST rate is greater than zero`,
      );
    }
    return {
      unitPrice: config.unitPrice.toNumber(),
      hsnSac: config.hsnSac ?? undefined,
      gstRate,
    };
  }

  private async processConsultationBilling(
    outbox: DomainEventOutbox,
    outboxId: string,
    hospitalId: string,
    jobContext: { jobId: string; workerId: string },
  ): Promise<DepartmentBillingProcessResult> {
    const payload = outbox.payload as {
      appointmentId?: string;
      patientId?: string;
    };
    if (!payload?.appointmentId || !payload?.patientId) {
      throw new JobPermanentFailureError('Invalid consultation billing payload');
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: payload.appointmentId,
        hospitalId,
        patientId: payload.patientId,
      },
    });
    if (!appointment) {
      throw new JobPermanentFailureError(
        'Appointment not found or patient mismatch for consultation billing',
      );
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    const fee = this.requireFee(
      {
        unitPrice: hospital.consultationFeeUnitPrice,
        hsnSac: hospital.consultationFeeHsnSac,
        gstRate: hospital.consultationFeeGstRate,
      },
      'consultation',
    );

    const sourceKey = opdConsultationBillingSourceKey(appointment.id);
    const result = await this.draftLineBilling.createDraftInvoiceWithLines({
      hospitalId,
      branchId: appointment.branchId,
      patientId: payload.patientId,
      lines: [
        {
          description: 'Consultation',
          quantity: 1,
          unitPrice: fee.unitPrice,
          hsnSac: fee.hsnSac,
          gstRate: fee.gstRate,
          sortOrder: 0,
          sourceKey,
        },
      ],
      outboxId,
      jobContext,
      auditMetadata: {
        eventType: outbox.eventType,
        appointmentId: appointment.id,
        sourceKey,
      },
    });

    return {
      outcome: result.outcome,
      invoiceId: result.invoiceId,
    };
  }

  private async processIpdDischarge(
    outbox: DomainEventOutbox,
    outboxId: string,
    hospitalId: string,
    jobContext: { jobId: string; workerId: string },
  ): Promise<DepartmentBillingProcessResult> {
    const payload = outbox.payload as {
      admissionId?: string;
      patientId?: string;
    };
    if (!payload?.admissionId || !payload?.patientId) {
      throw new JobPermanentFailureError('Invalid IPD discharge billing payload');
    }

    const admission = await this.prisma.ipdAdmission.findFirst({
      where: {
        id: payload.admissionId,
        hospitalId,
        patientId: payload.patientId,
        status: IpdAdmissionStatus.DISCHARGED,
      },
    });
    if (!admission) {
      throw new JobPermanentFailureError(
        'Discharged admission not found for IPD billing',
      );
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    const fee = this.requireFee(
      {
        unitPrice: hospital.ipdDischargeFeeUnitPrice,
        hsnSac: hospital.ipdDischargeFeeHsnSac,
        gstRate: hospital.ipdDischargeFeeGstRate,
      },
      'IPD discharge',
    );

    const sourceKey = ipdDischargeBillingSourceKey(admission.id);
    const result = await this.draftLineBilling.createDraftInvoiceWithLines({
      hospitalId,
      branchId: admission.branchId,
      patientId: payload.patientId,
      lines: [
        {
          description: 'IPD discharge services',
          quantity: 1,
          unitPrice: fee.unitPrice,
          hsnSac: fee.hsnSac,
          gstRate: fee.gstRate,
          sortOrder: 0,
          sourceKey,
        },
      ],
      outboxId,
      jobContext,
      auditMetadata: {
        eventType: outbox.eventType,
        admissionId: admission.id,
        sourceKey,
      },
    });

    return { outcome: result.outcome, invoiceId: result.invoiceId };
  }

  private async processEmergencyVisit(
    outbox: DomainEventOutbox,
    outboxId: string,
    hospitalId: string,
    jobContext: { jobId: string; workerId: string },
  ): Promise<DepartmentBillingProcessResult> {
    const payload = outbox.payload as {
      visitId?: string;
      patientId?: string;
    };
    if (!payload?.visitId || !payload?.patientId) {
      throw new JobPermanentFailureError('Invalid emergency visit billing payload');
    }

    const visit = await this.prisma.emergencyVisit.findFirst({
      where: {
        id: payload.visitId,
        hospitalId,
        patientId: payload.patientId,
        dispositionAt: { not: null },
      },
    });
    if (!visit) {
      throw new JobPermanentFailureError(
        'Emergency visit with disposition not found for billing',
      );
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    const fee = this.requireFee(
      {
        unitPrice: hospital.emergencyVisitFeeUnitPrice,
        hsnSac: hospital.emergencyVisitFeeHsnSac,
        gstRate: hospital.emergencyVisitFeeGstRate,
      },
      'emergency visit',
    );

    const sourceKey = emergencyVisitBillingSourceKey(visit.id);
    const result = await this.draftLineBilling.createDraftInvoiceWithLines({
      hospitalId,
      branchId: visit.branchId,
      patientId: payload.patientId,
      lines: [
        {
          description: 'Emergency visit',
          quantity: 1,
          unitPrice: fee.unitPrice,
          hsnSac: fee.hsnSac,
          gstRate: fee.gstRate,
          sortOrder: 0,
          sourceKey,
        },
      ],
      outboxId,
      jobContext,
      auditMetadata: {
        eventType: outbox.eventType,
        visitId: visit.id,
        sourceKey,
      },
    });

    return { outcome: result.outcome, invoiceId: result.invoiceId };
  }

  private async processDiagnosticOrder(
    outbox: DomainEventOutbox,
    outboxId: string,
    hospitalId: string,
    jobContext: { jobId: string; workerId: string },
  ): Promise<DepartmentBillingProcessResult> {
    const payload = outbox.payload as {
      diagnosticOrderId?: string;
      patientId?: string;
    };
    if (!payload?.diagnosticOrderId || !payload?.patientId) {
      throw new JobPermanentFailureError('Invalid diagnostic order billing payload');
    }

    const order = await this.prisma.diagnosticOrder.findFirst({
      where: {
        id: payload.diagnosticOrderId,
        hospitalId,
        patientId: payload.patientId,
        status: DiagnosticOrderStatus.COMPLETED,
      },
      include: { items: true },
    });
    if (!order) {
      throw new JobPermanentFailureError(
        'Completed diagnostic order not found for billing',
      );
    }

    const billableItems = order.items.filter(
      (item) => item.billableUnitPrice != null && item.billableUnitPrice.gt(0),
    );

    if (billableItems.length === 0) {
      await this.domainEventOutboxService.markProcessedIfPending(
        outboxId,
        hospitalId,
        this.prisma,
      );
      return { outcome: 'skipped' };
    }

    const lines = billableItems.map((item, index) => ({
      description: `${item.testName} (${item.testCode})`,
      quantity: 1,
      unitPrice: item.billableUnitPrice!.toNumber(),
      hsnSac: item.billableHsnSac ?? undefined,
      gstRate: item.billableGstRate?.toNumber() ?? 0,
      sortOrder: index,
      sourceKey: diagnosticOrderItemBillingSourceKey(item.id),
    }));

    const result = await this.draftLineBilling.createDraftInvoiceWithLines({
      hospitalId,
      branchId: order.branchId,
      patientId: payload.patientId,
      lines,
      outboxId,
      jobContext,
      auditMetadata: {
        eventType: outbox.eventType,
        diagnosticOrderId: order.id,
        itemCount: lines.length,
      },
    });

    return { outcome: result.outcome, invoiceId: result.invoiceId };
  }

  private async processSurgeryProcedure(
    outbox: DomainEventOutbox,
    outboxId: string,
    hospitalId: string,
    jobContext: { jobId: string; workerId: string },
  ): Promise<DepartmentBillingProcessResult> {
    const payload = outbox.payload as {
      surgeryRequestId?: string;
      patientId?: string;
    };
    if (!payload?.surgeryRequestId || !payload?.patientId) {
      throw new JobPermanentFailureError('Invalid surgery procedure billing payload');
    }

    const request = await this.prisma.surgeryRequest.findFirst({
      where: {
        id: payload.surgeryRequestId,
        hospitalId,
        patientId: payload.patientId,
        completedAt: { not: null },
      },
    });
    if (!request) {
      throw new JobPermanentFailureError(
        'Completed surgery request not found for billing',
      );
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    const fee = this.requireFee(
      {
        unitPrice: hospital.surgeryProcedureFeeUnitPrice,
        hsnSac: hospital.surgeryProcedureFeeHsnSac,
        gstRate: hospital.surgeryProcedureFeeGstRate,
      },
      'surgery procedure',
    );

    const sourceKey = surgeryProcedureBillingSourceKey(request.id);
    const result = await this.draftLineBilling.createDraftInvoiceWithLines({
      hospitalId,
      branchId: request.branchId,
      patientId: payload.patientId,
      lines: [
        {
          description: request.procedureName,
          quantity: 1,
          unitPrice: fee.unitPrice,
          hsnSac: fee.hsnSac,
          gstRate: fee.gstRate,
          sortOrder: 0,
          sourceKey,
        },
      ],
      outboxId,
      jobContext,
      auditMetadata: {
        eventType: outbox.eventType,
        surgeryRequestId: request.id,
        sourceKey,
      },
    });

    return { outcome: result.outcome, invoiceId: result.invoiceId };
  }
}
