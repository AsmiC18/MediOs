import {
  AppointmentStatus,
  InvoiceStatus,
  JobStatus,
  Prisma,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DepartmentBillingProcessService } from '../billing/department/department-billing-process.service';
import { DraftLineInvoiceBillingService } from '../billing/department/draft-line-invoice-billing.service';
import { StaffAttendanceConsultationJobHandler } from '../billing/staff-attendance-consultation.job-handler';
import { StaffAttendanceConsultationService } from '../billing/staff-attendance-consultation.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { AttendanceService } from './attendance.service';
import {
  STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE,
  staffAttendanceConsultationIdempotencyKey,
} from './staff-attendance-consultation-event.util';

describe('Staff attendance → consultation billing (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const CONSULTATION_FEE = 750;

  let hospitalId: string;
  let branchId: string;
  let staffUserId: string;
  let doctorResourceId: string;
  let patientId: string;
  let appointmentId: string;

  let attendanceService: AttendanceService;
  let consultationHandler: StaffAttendanceConsultationJobHandler;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    const jobService = new JobService(prisma as never);
    const outboxService = new DomainEventOutboxService(prisma as never, jobService);
    const auditService = new AuditService(prisma as never);
    attendanceService = new AttendanceService(
      prisma as never,
      auditService,
      outboxService,
    );
    const draftLineBilling = new DraftLineInvoiceBillingService(
      prisma as never,
      outboxService,
      auditService,
    );
    const departmentBillingProcess = new DepartmentBillingProcessService(
      prisma as never,
      outboxService,
      draftLineBilling,
    );
    const consultationService = new StaffAttendanceConsultationService(
      departmentBillingProcess,
    );
    consultationHandler = new StaffAttendanceConsultationJobHandler(
      consultationService,
    );

    const hospital = await prisma.hospital.create({
      data: {
        name: `A2 Billing ${runId}`,
        code: `A2B-${runId}`,
        consultationFeeUnitPrice: new Prisma.Decimal(CONSULTATION_FEE),
        consultationFeeGstRate: new Prisma.Decimal(0),
      },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: {
        hospitalId,
        name: 'Main',
        code: `BR-${runId}`,
      },
    });
    branchId = branch.id;

    const role = await prisma.role.create({
      data: {
        hospitalId,
        name: `DoctorRole-${runId}`,
      },
    });

    const staffUser = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Dr Staff',
        email: `a2-doctor-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    staffUserId = staffUser.id;

    const doctorResource = await prisma.resource.create({
      data: {
        hospitalId,
        branchId,
        userId: staffUserId,
        type: ResourceType.DOCTOR,
        name: 'Dr Resource',
        status: ResourceStatus.ACTIVE,
      },
    });
    doctorResourceId = doctorResource.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Consult',
        lastName: 'Patient',
        phone: `91${runId.slice(0, 8)}`,
      },
    });
    patientId = patient.id;

    const now = new Date();
    const startAt = new Date(now.getTime() - 60 * 60 * 1000);
    const endAt = new Date(now.getTime() + 60 * 60 * 1000);

    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        startAt,
        endAt,
        status: AppointmentStatus.SCHEDULED,
      },
    });
    appointmentId = appointment.id;

    await prisma.appointmentResource.create({
      data: {
        appointmentId,
        resourceId: doctorResourceId,
      },
    });

    const attendanceDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    await prisma.rosterEntry.create({
      data: {
        hospitalId,
        branchId,
        userId: staffUserId,
        date: attendanceDate,
        shiftStartTime: '09:00',
        shiftEndTime: '17:00',
      },
    });
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }

    await prisma.invoiceItem.deleteMany({ where: { hospitalId } });
    await prisma.invoice.deleteMany({ where: { hospitalId } });
    await prisma.attendance.deleteMany({ where: { hospitalId } });
    await prisma.job.deleteMany({ where: { hospitalId } });
    await prisma.domainEventOutbox.deleteMany({ where: { hospitalId } });
    await prisma.appointmentResource.deleteMany({
      where: { appointmentId },
    });
    await prisma.appointment.deleteMany({ where: { hospitalId } });
    await prisma.rosterEntry.deleteMany({ where: { hospitalId } });
    await prisma.resource.deleteMany({ where: { hospitalId } });
    await prisma.patient.deleteMany({ where: { hospitalId } });
    await prisma.user.deleteMany({ where: { hospitalId } });
    await prisma.role.deleteMany({ where: { hospitalId } });
    await prisma.branch.deleteMany({ where: { hospitalId } });
    await prisma.hospital.delete({ where: { id: hospitalId } });
    await prisma.$disconnect();
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itWithDb(
    'clock-in creates consultation outbox and billing produces one deduped draft line',
    async () => {
      const attendance = await attendanceService.clockIn({
        sub: staffUserId,
        hospitalId,
        branchId,
      });

      expect(attendance).toBeDefined();
      expect(attendance.userId).toBe(staffUserId);
      expect(attendance.clockIn).not.toBeNull();

      const expectedIdempotencyKey =
        staffAttendanceConsultationIdempotencyKey(appointmentId);

      const outboxRows = await prisma.domainEventOutbox.findMany({
        where: {
          hospitalId,
          eventType: STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE,
        },
      });

      expect(outboxRows).toHaveLength(1);
      const outbox = outboxRows[0]!;
      expect(outbox.eventType).toBe(STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE);
      expect(outbox.idempotencyKey).toBe(expectedIdempotencyKey);
      expect(outbox.payload).toMatchObject({
        appointmentId,
        patientId,
        hospitalId,
        userId: staffUserId,
        resourceId: doctorResourceId,
        attendanceId: attendance.id,
      });

      const billingJobs = await prisma.job.findMany({
        where: {
          hospitalId,
          type: JOB_TYPES.STAFF_ATTENDANCE_CONSULTATION,
        },
      });
      expect(billingJobs.length).toBeGreaterThanOrEqual(1);
      const billingJob = billingJobs.find(
        (row) =>
          (row.payload as { outboxId?: string })?.outboxId === outbox.id,
      );
      expect(billingJob).toBeDefined();

      await consultationHandler.handle(billingJob!, { workerId: 'a2-int' });

      const draftInvoices = await prisma.invoice.findMany({
        where: {
          hospitalId,
          patientId,
          status: InvoiceStatus.DRAFT,
        },
        include: { items: true },
      });

      expect(draftInvoices).toHaveLength(1);
      const invoice = draftInvoices[0]!;
      expect(invoice.patientId).toBe(patientId);

      const consultationItems = await prisma.invoiceItem.findMany({
        where: {
          hospitalId,
          sourceKey: expectedIdempotencyKey,
        },
      });

      expect(consultationItems).toHaveLength(1);
      const item = consultationItems[0]!;
      expect(item.description).toBe('Consultation');
      expect(item.quantity).toBe(1);
      expect(item.unitPrice.toNumber()).toBe(CONSULTATION_FEE);
      expect(item.sourceKey).toBe(expectedIdempotencyKey);
      expect(invoice.items).toHaveLength(1);
      expect(invoice.items[0]!.id).toBe(item.id);

      await consultationHandler.handle(billingJob!, { workerId: 'a2-int-retry' });

      const consultationItemsAfterRetry = await prisma.invoiceItem.findMany({
        where: {
          hospitalId,
          sourceKey: expectedIdempotencyKey,
        },
      });

      expect(consultationItemsAfterRetry).toHaveLength(1);
      expect(consultationItemsAfterRetry[0]!.id).toBe(item.id);

      const notificationJobs = await prisma.job.findMany({
        where: {
          hospitalId,
          type: JOB_TYPES.NOTIFICATION_DISPATCH,
        },
      });
      expect(notificationJobs).toHaveLength(0);
    },
  );
});
