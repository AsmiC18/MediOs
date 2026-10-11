import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  PharmacyPrescriptionWorkItemStatus,
  PharmacyStockMovementType,
  PrescriptionStatus,
  PrismaClient,
} from '@prisma/client';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PharmacyPrescriptionWorkItemService } from './pharmacy-prescription-work-item.service';
import { PharmacyService } from './pharmacy.service';

describe('Pharmacy prescription work queue (C3.2 integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let otherBranchId: string;
  let otherHospitalId: string;
  let userId: string;
  let roleId: string;
  let patientId: string;
  let productId: string;
  let prescriptionItemId: string;

  let workItemService: PharmacyPrescriptionWorkItemService;
  let pharmacyService: PharmacyService;
  const billingEnqueue = { enqueueForDispensing: jest.fn() };

  const hospitalUser = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  const branchUser = () => ({
    sub: userId,
    hospitalId,
    branchId,
  });

  const otherHospitalUser = () => ({
    sub: userId,
    hospitalId: otherHospitalId,
    branchId: null as string | null,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const audit = new AuditService(prisma as never);
    pharmacyService = new PharmacyService(
      prisma as never,
      audit,
      billingEnqueue as never,
    );
    workItemService = new PharmacyPrescriptionWorkItemService(
      prisma as never,
      audit,
      pharmacyService,
    );

    const hospital = await prisma.hospital.create({
      data: { name: `C32 ${runId}`, code: `C32-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `Other ${runId}`, code: `OC32-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const otherBranch = await prisma.branch.create({
      data: { hospitalId, name: 'Other', code: `OBR-${runId}` },
    });
    otherBranchId = otherBranch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Pharm-${runId}` },
    });
    roleId = role.id;

    for (const name of ['pharmacy:read', 'pharmacy:manage']) {
      const permission = await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name, description: name },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }

    const user = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Pharmacist',
        email: `c32-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = user.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Rx',
        lastName: runId,
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;

    const product = await prisma.pharmacyProduct.create({
      data: {
        hospitalId,
        branchId,
        name: `Med ${runId}`,
        unit: 'tab',
        sku: `M-${runId}`,
      },
    });
    productId = product.id;

    await prisma.pharmacyBatch.create({
      data: {
        hospitalId,
        branchId,
        productId,
        batchNumber: `BAT-${runId}`,
        expiryDate: new Date('2029-06-01T00:00:00.000Z'),
        quantity: 500,
        sellingPrice: 5,
      },
    });
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  async function createWorkItem(options?: {
    branch?: string;
    status?: PharmacyPrescriptionWorkItemStatus;
  }) {
    const useBranch = options?.branch ?? branchId;
    const encounter = await prisma.clinicalEncounter.create({
      data: {
        hospitalId,
        branchId: useBranch,
        patientId,
        providerUserId: userId,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.OPEN,
      },
    });

    const prescription = await prisma.prescription.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        patientId,
        prescribedByUserId: userId,
        status: PrescriptionStatus.ACTIVE,
        items: {
          create: [{ medicationName: 'Tab Med', quantity: 10 }],
        },
      },
      include: { items: true },
    });

    prescriptionItemId = prescription.items[0]!.id;

    const workItem = await prisma.pharmacyPrescriptionWorkItem.create({
      data: {
        hospitalId,
        branchId: useBranch,
        prescriptionId: prescription.id,
        encounterId: encounter.id,
        patientId,
        status: options?.status ?? PharmacyPrescriptionWorkItemStatus.OPEN,
      },
    });

    return { workItem, prescription, prescriptionItemId: prescription.items[0]!.id };
  }

  itWithDb('lists OPEN work items with pagination and status filter', async () => {
    const { workItem } = await createWorkItem();
    await createWorkItem({ status: PharmacyPrescriptionWorkItemStatus.CANCELLED });

    const openList = await workItemService.listWorkItems(hospitalUser(), {
      status: PharmacyPrescriptionWorkItemStatus.OPEN,
      limit: 10,
      page: 1,
    });

    expect(openList.data.some((row) => row.id === workItem.id)).toBe(true);
    expect(openList.data.every((row) => row.workItemStatus === 'OPEN')).toBe(true);
    expect(openList.meta.page).toBe(1);
    expect(openList.meta.limit).toBe(10);
  });

  itWithDb('denies branch user access to another branch work item', async () => {
    const { workItem } = await createWorkItem({ branch: otherBranchId });

    await expect(
      workItemService.getWorkItem(branchUser(), workItem.id),
    ).rejects.toThrow(ForbiddenException);
  });

  itWithDb('denies cross-hospital work item access', async () => {
    const { workItem } = await createWorkItem();

    await expect(
      workItemService.getWorkItem(otherHospitalUser(), workItem.id),
    ).rejects.toThrow(NotFoundException);
  });

  itWithDb('returns detail with prescription summary for same-branch user', async () => {
    const { workItem } = await createWorkItem();

    const detail = await workItemService.getWorkItem(branchUser(), workItem.id);

    expect(detail.id).toBe(workItem.id);
    expect(detail.prescription.items[0]?.medicationName).toBe('Tab Med');
    expect(detail.prescriptionStatus).toBe(PrescriptionStatus.ACTIVE);
  });

  itWithDb('cancels OPEN work item and writes audit', async () => {
    const { workItem } = await createWorkItem();

    const cancelled = await workItemService.cancelWorkItem(
      hospitalUser(),
      workItem.id,
    );

    expect(cancelled.workItemStatus).toBe(
      PharmacyPrescriptionWorkItemStatus.CANCELLED,
    );
    expect(cancelled.processedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'PHARMACY_PRESCRIPTION_WORK_ITEM_CANCELLED',
        entityId: workItem.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  itWithDb('rejects invalid cancel from COMPLETED work item', async () => {
    const { workItem, prescriptionItemId: itemId } = await createWorkItem();

    await workItemService.fulfillWorkItem(hospitalUser(), workItem.id, {
      items: [{ prescriptionItemId: itemId, productId, quantity: 2 }],
    });

    await expect(
      workItemService.cancelWorkItem(hospitalUser(), workItem.id),
    ).rejects.toThrow(ConflictException);
  });

  itWithDb('fulfills via existing dispensing workflow and completes work item', async () => {
    const { workItem, prescriptionItemId: itemId } = await createWorkItem();

    const beforeStock = await prisma.pharmacyBatch.aggregate({
      where: { hospitalId, productId },
      _sum: { quantity: true },
    });

    const result = await workItemService.fulfillWorkItem(
      hospitalUser(),
      workItem.id,
      {
        items: [{ prescriptionItemId: itemId, productId, quantity: 3 }],
      },
    );

    expect(result.alreadyFulfilled).toBe(false);
    expect(result.workItem.workItemStatus).toBe(
      PharmacyPrescriptionWorkItemStatus.COMPLETED,
    );
    expect(result.workItem.fulfilledDispensingId).toBe(result.dispensing.id);

    const afterStock = await prisma.pharmacyBatch.aggregate({
      where: { hospitalId, productId },
      _sum: { quantity: true },
    });
    expect(afterStock._sum.quantity).toBe((beforeStock._sum.quantity ?? 0) - 3);

    const movements = await prisma.pharmacyStockMovement.count({
      where: {
        hospitalId,
        referenceId: result.dispensing.id,
        movementType: PharmacyStockMovementType.DISPENSE,
      },
    });
    expect(movements).toBeGreaterThan(0);
    expect(billingEnqueue.enqueueForDispensing).toHaveBeenCalled();
  });

  itWithDb('concurrent fulfill attempts yield one dispensing', async () => {
    const { workItem, prescriptionItemId: itemId } = await createWorkItem();

    const body = {
      items: [{ prescriptionItemId: itemId, productId, quantity: 1 }],
    };

    const [first, second] = await Promise.all([
      workItemService.fulfillWorkItem(hospitalUser(), workItem.id, body),
      workItemService.fulfillWorkItem(hospitalUser(), workItem.id, body),
    ]);

    const dispensingIds = new Set([
      first.dispensing.id,
      second.dispensing.id,
    ]);
    expect(dispensingIds.size).toBe(1);

    const count = await prisma.pharmacyDispensing.count({
      where: { hospitalId, prescriptionId: workItem.prescriptionId },
    });
    expect(count).toBe(1);

    expect(
      first.alreadyFulfilled !== second.alreadyFulfilled ||
        (first.alreadyFulfilled && second.alreadyFulfilled),
    ).toBe(true);
  });

  itWithDb('repeat fulfill after completion is idempotent', async () => {
    const { workItem, prescriptionItemId: itemId } = await createWorkItem();
    const body = {
      items: [{ prescriptionItemId: itemId, productId, quantity: 1 }],
    };

    const first = await workItemService.fulfillWorkItem(
      hospitalUser(),
      workItem.id,
      body,
    );
    const second = await workItemService.fulfillWorkItem(
      hospitalUser(),
      workItem.id,
      body,
    );

    expect(second.alreadyFulfilled).toBe(true);
    expect(second.dispensing.id).toBe(first.dispensing.id);
  });
});
