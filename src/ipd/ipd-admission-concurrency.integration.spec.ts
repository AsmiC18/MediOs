import {
  BedStatus,
  BedType,
  IpdAdmissionStatus,
  PrismaClient,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { IpdAdmissionService } from './ipd-admission.service';

describe('IPD admission concurrency (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let bedId: string;
  let service: IpdAdmissionService;

  const user = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    service = new IpdAdmissionService(
      prisma as never,
      new AuditService(prisma as never),
      { enqueueAfterCommit: jest.fn() } as never,
    );

    const hospital = await prisma.hospital.create({
      data: { name: `IPD Conc ${runId}`, code: `IPDC-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Admin',
        email: `ipd-conc-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = admin.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat',
        lastName: runId,
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;

    const bed = await prisma.ipdBed.create({
      data: {
        hospitalId,
        branchId,
        wardName: 'W1',
        roomNumber: '101',
        bedNumber: `B-${runId}`,
        bedType: BedType.GENERAL,
        status: BedStatus.AVAILABLE,
      },
    });
    bedId = bed.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  it('allows only one concurrent ADMITTED admission per patient', async () => {
    if (!dbAvailable) {
      return;
    }

    const dto = {
      patientId,
      branchId,
      bedId,
      reason: 'Concurrent test',
    };

    const results = await Promise.allSettled([
      service.createAdmission(user(), dto),
      service.createAdmission(user(), dto),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const failure = rejected[0] as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ConflictException);

    const admitted = await prisma.ipdAdmission.findMany({
      where: {
        hospitalId,
        patientId,
        status: IpdAdmissionStatus.ADMITTED,
      },
    });
    expect(admitted).toHaveLength(1);

    const assignments = await prisma.ipdBedAssignment.findMany({
      where: { hospitalId, admissionId: admitted[0].id, releasedAt: null },
    });
    expect(assignments).toHaveLength(1);

    const openAssignmentsForPatient = await prisma.ipdBedAssignment.count({
      where: {
        hospitalId,
        releasedAt: null,
        admission: { patientId, status: IpdAdmissionStatus.ADMITTED },
      },
    });
    expect(openAssignmentsForPatient).toBe(1);
  });

  it('allows readmission after discharge', async () => {
    if (!dbAvailable) {
      return;
    }

    const patient2 = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat2',
        lastName: runId,
        phone: `8${runId.slice(-9)}`,
      },
    });

    const first = await service.createAdmission(user(), {
      patientId: patient2.id,
      branchId,
    });
    await service.discharge(user(), first.id);

    const second = await service.createAdmission(user(), {
      patientId: patient2.id,
      branchId,
    });
    expect(second.status).toBe(IpdAdmissionStatus.ADMITTED);
  });

  it('allows new admission after cancel', async () => {
    if (!dbAvailable) {
      return;
    }

    const patient3 = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat3',
        lastName: runId,
        phone: `7${runId.slice(-9)}`,
      },
    });

    const first = await service.createAdmission(user(), {
      patientId: patient3.id,
      branchId,
    });
    await service.cancelAdmission(user(), first.id);

    const second = await service.createAdmission(user(), {
      patientId: patient3.id,
      branchId,
    });
    expect(second.status).toBe(IpdAdmissionStatus.ADMITTED);
  });

  it('allows concurrent admissions for different patients', async () => {
    if (!dbAvailable) {
      return;
    }

    const patientA = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'A',
        lastName: runId,
        phone: `6${runId.slice(-9)}`,
      },
    });
    const patientB = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'B',
        lastName: runId,
        phone: `5${runId.slice(-9)}`,
      },
    });

    const [admA, admB] = await Promise.all([
      service.createAdmission(user(), { patientId: patientA.id, branchId }),
      service.createAdmission(user(), { patientId: patientB.id, branchId }),
    ]);

    expect(admA.patientId).toBe(patientA.id);
    expect(admB.patientId).toBe(patientB.id);
  });
});
