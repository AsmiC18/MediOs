import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PATIENT_PRIVACY_EXPORT_REQUESTED } from './patient-privacy-audit.actions';
import {
  findOwnedPatientForPrivacy,
  PatientPrivacyActor,
  resolvePrivacyAuditUserId,
} from './patient-privacy-access.util';

export const PATIENT_PRIVACY_EXPORT_VERSION = '1.0';
const MAX_EXPORT_BYTES = 4_000_000;

@Injectable()
export class PatientPrivacyExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async exportPatientData(user: PatientPrivacyActor, patientId: string) {
    const patient = await findOwnedPatientForPrivacy(
      this.prisma,
      user,
      patientId,
    );

    const payload = {
      exportVersion: PATIENT_PRIVACY_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      hospitalId: user.hospitalId,
      patientId,
      patient: this.serializePatient(patient),
      fieldHistory: await this.prisma.patientFieldHistory.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { changedAt: 'asc' },
        select: {
          id: true,
          fieldName: true,
          oldValue: true,
          newValue: true,
          changedByUserId: true,
          changedAt: true,
        },
      }),
      appointments: await this.prisma.appointment.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { startAt: 'asc' },
      }),
      opdQueueEntries: await this.prisma.opdQueueEntry.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { createdAt: 'asc' },
      }),
      clinicalEncounters: await this.loadClinicalEncounters(user.hospitalId, patientId),
      prescriptions: await this.loadPrescriptions(user.hospitalId, patientId),
      diagnosticOrders: await this.loadDiagnosticOrders(user.hospitalId, patientId),
      invoices: await this.loadInvoices(user.hospitalId, patientId),
      ipdAdmissions: await this.prisma.ipdAdmission.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { admissionDate: 'asc' },
      }),
      emergencyVisits: await this.prisma.emergencyVisit.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { arrivalAt: 'asc' },
      }),
      pharmacyDispensings: await this.prisma.pharmacyDispensing.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { createdAt: 'asc' },
      }),
      surgeryRequests: await this.prisma.surgeryRequest.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { createdAt: 'asc' },
      }),
      insurancePolicies: await this.prisma.patientInsurancePolicy.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { createdAt: 'asc' },
      }),
      insurancePreAuthorizations:
        await this.prisma.insurancePreAuthorization.findMany({
          where: { hospitalId: user.hospitalId, patientId },
          orderBy: { requestDate: 'asc' },
        }),
      insuranceClaims: await this.prisma.insuranceClaim.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { createdAt: 'asc' },
      }),
      abhaLink: await this.prisma.patientAbhaLink.findUnique({
        where: { patientId },
        select: {
          id: true,
          hospitalId: true,
          patientId: true,
          abhaNumber: true,
          abhaAddress: true,
          linkStatus: true,
          verificationMethod: true,
          linkedAt: true,
          lastVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      abdmConsents: await this.prisma.abdmConsent.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          purpose: true,
          hiTypes: true,
          status: true,
          grantedAt: true,
          deniedAt: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      notificationPreferences:
        await this.prisma.patientNotificationPreference.findMany({
          where: { hospitalId: user.hospitalId, patientId },
        }),
      privacyConsents: await this.prisma.patientPrivacyConsent.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          consentType: true,
          purpose: true,
          status: true,
          version: true,
          grantedAt: true,
          withdrawnAt: true,
          relatedGrantId: true,
          createdAt: true,
        },
      }),
      clinicalAttachments: await this.prisma.clinicalAttachment.findMany({
        where: { hospitalId: user.hospitalId, patientId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          encounterId: true,
          originalFileName: true,
          contentType: true,
          sizeBytes: true,
          checksumSha256: true,
          category: true,
          description: true,
          uploadedByUserId: true,
          deletedAt: true,
          createdAt: true,
        },
      }),
    };

    const serialized = this.serializeForJson(payload);
    const json = JSON.stringify(serialized);
    if (Buffer.byteLength(json, 'utf8') > MAX_EXPORT_BYTES) {
      throw new PayloadTooLargeException(
        'Patient export exceeds maximum allowed size',
      );
    }

    await this.auditService.log({
      action: PATIENT_PRIVACY_EXPORT_REQUESTED,
      entity: 'Patient',
      entityId: patientId,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: resolvePrivacyAuditUserId(user),
      metadata: {
        patientId,
        exportVersion: PATIENT_PRIVACY_EXPORT_VERSION,
      },
    });

    return serialized;
  }

  private serializePatient(patient: {
    id: string;
    hospitalId: string;
    branchId: string | null;
    phone: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    abhaId: string | null;
    allergies: string[];
    chronicConditions: string[];
    emergencyContacts: Prisma.JsonValue;
    mergedIntoPatientId: string | null;
    mergedAt: Date | null;
    isAtRisk: boolean;
    anonymizedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: patient.id,
      hospitalId: patient.hospitalId,
      branchId: patient.branchId,
      phone: patient.phone,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      abhaId: patient.abhaId,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      emergencyContacts: patient.emergencyContacts,
      mergedIntoPatientId: patient.mergedIntoPatientId,
      mergedAt: patient.mergedAt,
      isAtRisk: patient.isAtRisk,
      anonymizedAt: patient.anonymizedAt,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
  }

  private async loadClinicalEncounters(hospitalId: string, patientId: string) {
    const encounters = await this.prisma.clinicalEncounter.findMany({
      where: { hospitalId, patientId },
      orderBy: { startedAt: 'asc' },
    });

    const encounterIds = encounters.map((e) => e.id);
    const [soapNotes, soapNoteVersions, diagnoses] = await Promise.all([
      this.prisma.clinicalSoapNote.findMany({
        where: { hospitalId, encounterId: { in: encounterIds } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.clinicalSoapNoteVersion.findMany({
        where: { hospitalId, encounterId: { in: encounterIds } },
        orderBy: [{ encounterId: 'asc' }, { version: 'asc' }],
        select: {
          encounterId: true,
          version: true,
          subjective: true,
          objective: true,
          assessment: true,
          plan: true,
          createdByUserId: true,
          createdAt: true,
        },
      }),
      this.prisma.clinicalDiagnosis.findMany({
        where: { hospitalId, encounterId: { in: encounterIds } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const soapByEncounter = new Map<string, typeof soapNotes>();
    for (const note of soapNotes) {
      const list = soapByEncounter.get(note.encounterId) ?? [];
      list.push(note);
      soapByEncounter.set(note.encounterId, list);
    }
    const soapVersionsByEncounter = new Map<
      string,
      Array<Omit<(typeof soapNoteVersions)[number], 'encounterId'>>
    >();
    for (const row of soapNoteVersions) {
      const list = soapVersionsByEncounter.get(row.encounterId) ?? [];
      const { encounterId: _encounterId, ...versionRow } = row;
      list.push(versionRow);
      soapVersionsByEncounter.set(row.encounterId, list);
    }
    const dxByEncounter = new Map<string, typeof diagnoses>();
    for (const dx of diagnoses) {
      const list = dxByEncounter.get(dx.encounterId) ?? [];
      list.push(dx);
      dxByEncounter.set(dx.encounterId, list);
    }

    return encounters.map((encounter) => ({
      ...encounter,
      soapNotes: soapByEncounter.get(encounter.id) ?? [],
      soapNoteVersions: soapVersionsByEncounter.get(encounter.id) ?? [],
      diagnoses: dxByEncounter.get(encounter.id) ?? [],
    }));
  }

  private async loadPrescriptions(hospitalId: string, patientId: string) {
    const prescriptions = await this.prisma.prescription.findMany({
      where: { hospitalId, patientId },
      orderBy: { createdAt: 'asc' },
    });
    const prescriptionIds = prescriptions.map((p) => p.id);
    const items = await this.prisma.prescriptionItem.findMany({
      where: { prescriptionId: { in: prescriptionIds } },
      orderBy: { id: 'asc' },
    });
    const itemsByRx = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByRx.get(item.prescriptionId) ?? [];
      list.push(item);
      itemsByRx.set(item.prescriptionId, list);
    }
    return prescriptions.map((rx) => ({
      ...rx,
      items: itemsByRx.get(rx.id) ?? [],
    }));
  }

  private async loadDiagnosticOrders(hospitalId: string, patientId: string) {
    const orders = await this.prisma.diagnosticOrder.findMany({
      where: { hospitalId, patientId },
      orderBy: { orderedAt: 'asc' },
    });
    const orderIds = orders.map((o) => o.id);
    const items = await this.prisma.diagnosticOrderItem.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: { createdAt: 'asc' },
    });
    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }
    return orders.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
    }));
  }

  private async loadInvoices(hospitalId: string, patientId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { hospitalId, patientId },
      orderBy: { createdAt: 'asc' },
    });
    const invoiceIds = invoices.map((i) => i.id);
    const [items, payments] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { invoiceId: { in: invoiceIds } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: { hospitalId, invoiceId: { in: invoiceIds } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          hospitalId: true,
          branchId: true,
          invoiceId: true,
          amount: true,
          currency: true,
          provider: true,
          status: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    const itemsByInvoice = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByInvoice.get(item.invoiceId) ?? [];
      list.push(item);
      itemsByInvoice.set(item.invoiceId, list);
    }
    const paymentsByInvoice = new Map<string, typeof payments>();
    for (const payment of payments) {
      const list = paymentsByInvoice.get(payment.invoiceId) ?? [];
      list.push(payment);
      paymentsByInvoice.set(payment.invoiceId, list);
    }
    return invoices.map((invoice) => ({
      ...invoice,
      items: itemsByInvoice.get(invoice.id) ?? [],
      payments: paymentsByInvoice.get(invoice.id) ?? [],
    }));
  }

  private serializeForJson(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'object' && 'toFixed' in (value as object)) {
      return (value as { toString: () => string }).toString();
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.serializeForJson(entry));
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (/storageKey|passwordHash|linkToken|providerPaymentLinkId/i.test(key)) {
          continue;
        }
        out[key] = this.serializeForJson(entry);
      }
      return out;
    }
    return value;
  }
}
