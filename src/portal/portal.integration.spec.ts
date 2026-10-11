jest.mock('@nestjs/jwt', () => {
  const jwtLib = require('jsonwebtoken');
  const secret =
    process.env.JWT_SECRET?.trim() ||
    'test-jwt-secret-at-least-32-characters-long';
  return {
    JwtService: jest.fn().mockImplementation(() => ({
      signAsync: (payload: object) =>
        Promise.resolve(jwtLib.sign(payload, secret, { expiresIn: '15m' })),
    })),
  };
});

import {
  AppointmentStatus,
  PatientPortalAccountStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { toStaffJwtUser } from '../auth/staff-jwt-payload.util';
import { RateLimitStoreService } from '../common/rate-limit/rate-limit-store.service';
import { canonicalizePatientPhone } from '../common/utils/phone.util';
import { RateLimitExceededException } from '../common/rate-limit/rate-limit-exceeded.exception';
import { JobService } from '../jobs/job.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import {
  APPOINTMENT_BOOKED_EVENT_TYPE,
} from '../scheduling/appointments/appointment-booked-event.util';
import { AppointmentsService } from '../scheduling/appointments/appointments.service';
import { SchedulingPolicyService } from '../scheduling/scheduling-policy.service';
import { PORTAL_INVALID_CREDENTIALS_MESSAGE } from './portal-auth.constants';
import { PortalLoginRateLimitService } from './portal-auth/portal-login-rate-limit.service';
import { PatientPortalAuthService } from './portal-auth/patient-portal-auth.service';
import {
  PatientPortalSessionService,
  PortalRefreshReuseDetectedError,
} from './portal-auth/patient-portal-session.service';
import { PortalPrincipalGuard } from './portal-auth/guards/portal-principal.guard';
import { toPatientPrincipal } from './portal-auth/portal-jwt-payload.util';
import { PortalPatientsService } from './portal-patients/portal-patients.service';
import { PATIENT_PRINCIPAL_TYPE, PatientPrincipal } from './portal.types';

describe('Patient portal integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const password = 'PortalPass1!';
  const phone = canonicalizePatientPhone(
    `98765${runId.replace(/\D/g, '').slice(-5)}`.slice(0, 10),
  );

  let hospitalId: string;
  let hospitalCode: string;
  let branchId: string;
  let otherHospitalId: string;
  let otherPatientId: string;
  let patientId: string;
  let resourceId: string;
  let staffUserId: string;
  let staffRoleId: string;

  let portalAuth: PatientPortalAuthService;
  let portalPatients: PortalPatientsService;
  let appointmentsService: AppointmentsService;
  let jwtService: JwtService;
  let portalPrincipalGuard: PortalPrincipalGuard;

  const principal = (): PatientPrincipal => ({
    principalType: PATIENT_PRINCIPAL_TYPE,
    patientId,
    hospitalId,
    branchId,
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
    const rateLimitStore = new RateLimitStoreService(prisma as never);
    const portalLoginRateLimit = new PortalLoginRateLimitService(rateLimitStore);
    const portalSession = new PatientPortalSessionService(prisma as never);
    jwtService = new JwtService();
    portalAuth = new PatientPortalAuthService(
      prisma as never,
      jwtService,
      audit,
      portalLoginRateLimit,
      portalSession,
    );
    portalPatients = new PortalPatientsService(prisma as never);
    portalPrincipalGuard = new PortalPrincipalGuard(prisma as never);

    const jobService = new JobService(prisma as never);
    const outbox = new DomainEventOutboxService(prisma as never, jobService);
    appointmentsService = new AppointmentsService(
      prisma as never,
      audit,
      outbox,
      { enqueueNpsTriggerIfNewlyCompleted: jest.fn().mockResolvedValue(undefined) } as never,
      new SchedulingPolicyService(prisma as never),
    );

    hospitalCode = `PPL-${runId}`;
    const hospital = await prisma.hospital.create({
      data: { name: `Portal ${runId}`, code: hospitalCode },
    });
    hospitalId = hospital.id;

    const bookingRule = await prisma.bookingRule.create({
      data: {
        hospitalId,
        minDurationMinutes: 15,
        maxDurationMinutes: 120,
        slotDurationMinutes: 15,
      },
    });
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { defaultBookingRuleId: bookingRule.id },
    });

    branchId = (
      await prisma.branch.create({
        data: { hospitalId, name: 'Main', code: `PB-${runId}` },
      })
    ).id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `Portal Other ${runId}`, code: `PPO-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Portal',
        lastName: 'Patient',
        phone,
        email: `portal-${runId}@example.com`,
      },
    });
    patientId = patient.id;

    otherPatientId = (
      await prisma.patient.create({
        data: {
          hospitalId: otherHospitalId,
          firstName: 'Other',
          lastName: 'Hospital',
          phone: canonicalizePatientPhone(
          `87654${runId.replace(/\D/g, '').slice(-5)}`.slice(0, 10),
        ),
        },
      })
    ).id;

    resourceId = (
      await prisma.resource.create({
        data: {
          hospitalId,
          branchId,
          type: ResourceType.DOCTOR,
          name: `Dr Portal ${runId}`,
          status: ResourceStatus.ACTIVE,
        },
      })
    ).id;

    staffRoleId = (
      await prisma.role.create({
        data: { hospitalId, name: `Staff-${runId}` },
      })
    ).id;

    staffUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          branchId,
          roleId: staffRoleId,
          name: 'Staff',
          email: `staff-${runId}@example.com`,
          passwordHash: 'hash',
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!dbAvailable || !hospitalId) {
      return;
    }
    await prisma.rateLimitBucket.deleteMany({
      where: { scope: 'portal-login' },
    });
    await prisma.patientPortalSession.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.patientPortalAccount.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.domainEventOutbox.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.appointmentResource.deleteMany({
      where: { appointment: { hospitalId: { in: [hospitalId, otherHospitalId] } } },
    });
    await prisma.appointment.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.resource.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.user.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.role.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.patient.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.bookingRule.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.branch.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.hospital.deleteMany({
      where: { id: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.$disconnect();
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  async function activateAccount(targetPhone = phone) {
    await portalAuth.activate({
      hospitalCode,
      phone: targetPhone,
      password,
    });
  }

  async function loginAccount(targetPhone = phone) {
    return portalAuth.login({
      hospitalCode,
      phone: targetPhone,
      password,
    });
  }

  itDb('activates patient portal account', async () => {
    const result = await portalAuth.activate({
      hospitalCode,
      phone,
      password,
    });
    expect(result.activated).toBe(true);
    const account = await prisma.patientPortalAccount.findUnique({
      where: { patientId },
    });
    expect(account?.status).toBe(PatientPortalAccountStatus.ACTIVE);
    expect(account?.passwordHash).not.toBe(password);
  });

  itDb('rejects duplicate activation', async () => {
    await expect(
      portalAuth.activate({ hospitalCode, phone, password: 'AnotherPass1!' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('login succeeds and wrong password is generic failure', async () => {
    const session = await loginAccount();
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.patient.id).toBe(patientId);

    await expect(
      portalAuth.login({ hospitalCode, phone, password: 'WrongPass1!' }),
    ).rejects.toMatchObject({
      message: PORTAL_INVALID_CREDENTIALS_MESSAGE,
    });

    await prisma.rateLimitBucket.deleteMany({
      where: { scope: 'portal-login', bucketKey: `${hospitalId}:${phone}` },
    });
  });

  itDb('login rate limit blocks repeated failures', async () => {
    const prevMax = process.env.PORTAL_LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
    const prevEnabled = process.env.PORTAL_LOGIN_RATE_LIMIT_ENABLED;
    process.env.PORTAL_LOGIN_RATE_LIMIT_ENABLED = 'true';
    process.env.PORTAL_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '2';

    const audit = new AuditService(prisma as never);
    const rateLimitStore = new RateLimitStoreService(prisma as never);
    const limitedAuth = new PatientPortalAuthService(
      prisma as never,
      jwtService,
      audit,
      new PortalLoginRateLimitService(rateLimitStore),
      new PatientPortalSessionService(prisma as never),
    );

    const failPhone = canonicalizePatientPhone(
      `87659${runId.replace(/\D/g, '').slice(-5)}`.slice(0, 10),
    );
    const failPatient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Rate',
        lastName: 'Limit',
        phone: failPhone,
      },
    });
    await limitedAuth.activate({
      hospitalCode,
      phone: failPhone,
      password,
    });

    await expect(
      limitedAuth.login({ hospitalCode, phone: failPhone, password: 'WrongPass1!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      limitedAuth.login({ hospitalCode, phone: failPhone, password: 'WrongPass1!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      limitedAuth.login({ hospitalCode, phone: failPhone, password: 'WrongPass1!' }),
    ).rejects.toBeInstanceOf(RateLimitExceededException);

    await prisma.patientPortalSession.deleteMany({
      where: { patientId: failPatient.id },
    });
    await prisma.patientPortalAccount.deleteMany({
      where: { patientId: failPatient.id },
    });
    await prisma.patient.delete({ where: { id: failPatient.id } });

    process.env.PORTAL_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = prevMax;
    process.env.PORTAL_LOGIN_RATE_LIMIT_ENABLED = prevEnabled;
  });

  itDb('refresh rotates token and reuse revokes family', async () => {
    const first = await loginAccount();
    const rotated = await portalAuth.refresh(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    await expect(portalAuth.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      PortalRefreshReuseDetectedError,
    );

    const familyId = (
      await prisma.patientPortalSession.findFirst({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
      })
    )!.familyId;

    const activeInFamily = await prisma.patientPortalSession.count({
      where: { patientId, familyId, revokedAt: null },
    });
    expect(activeInFamily).toBe(0);
  });

  itDb('logout revokes session idempotently', async () => {
    const session = await loginAccount();
    const p = principal();
    await portalAuth.logout(session.refreshToken, p);
    await portalAuth.logout(session.refreshToken, p);
    await expect(portalAuth.refresh(session.refreshToken)).rejects.toBeDefined();
  });

  itDb('staff JWT rejected on portal strategy; patient JWT rejected on staff strategy', async () => {
    expect(() =>
      toPatientPrincipal({
        principalType: 'STAFF',
        sub: staffUserId,
        hospitalId,
        roleId: staffRoleId,
        role: 'ADMIN',
      } as never),
    ).toThrow(UnauthorizedException);

    expect(() =>
      toStaffJwtUser({
        principalType: PATIENT_PRINCIPAL_TYPE,
        sub: patientId,
        hospitalId,
        branchId,
      }),
    ).toThrow(UnauthorizedException);
  });

  itDb('anonymized and merged patients cannot login', async () => {
    const anonPhone = canonicalizePatientPhone(
      `76543${runId.replace(/\D/g, '').slice(-5)}`.slice(0, 10),
    );
    const anonPatient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Anon',
        lastName: 'Test',
        phone: anonPhone,
        anonymizedAt: new Date(),
      },
    });
    await prisma.patientPortalAccount.create({
      data: {
        patientId: anonPatient.id,
        hospitalId,
        passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
        status: PatientPortalAccountStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });
    await expect(
      portalAuth.login({ hospitalCode, phone: anonPhone, password: 'x' }),
    ).rejects.toMatchObject({ message: PORTAL_INVALID_CREDENTIALS_MESSAGE });

    const mergedPhone = canonicalizePatientPhone(
      `65432${runId.replace(/\D/g, '').slice(-5)}`.slice(0, 10),
    );
    const mergedPatient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Merged',
        lastName: 'Test',
        phone: mergedPhone,
        mergedIntoPatientId: patientId,
      },
    });
    await prisma.patientPortalAccount.create({
      data: {
        patientId: mergedPatient.id,
        hospitalId,
        passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
        status: PatientPortalAccountStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });
    await expect(
      portalAuth.login({ hospitalCode, phone: mergedPhone, password: 'x' }),
    ).rejects.toMatchObject({ message: PORTAL_INVALID_CREDENTIALS_MESSAGE });

    await prisma.patientPortalAccount.deleteMany({
      where: { patientId: { in: [anonPatient.id, mergedPatient.id] } },
    });
    await prisma.patient.deleteMany({
      where: { id: { in: [anonPatient.id, mergedPatient.id] } },
    });
  });

  itDb('refresh fails after patient anonymization', async () => {
    const isoPhone = canonicalizePatientPhone(
      `91234${runId.replace(/\D/g, '').slice(-5)}`.slice(0, 10),
    );
    const isoPatient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Iso',
        lastName: 'Refresh',
        phone: isoPhone,
      },
    });
    await portalAuth.activate({ hospitalCode, phone: isoPhone, password });
    const session = await portalAuth.login({
      hospitalCode,
      phone: isoPhone,
      password,
    });
    await prisma.patient.update({
      where: { id: isoPatient.id },
      data: { anonymizedAt: new Date() },
    });
    await expect(portalAuth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await prisma.patientPortalSession.deleteMany({
      where: { patientId: isoPatient.id },
    });
    await prisma.patientPortalAccount.deleteMany({
      where: { patientId: isoPatient.id },
    });
    await prisma.patient.delete({ where: { id: isoPatient.id } });
  });

  itDb('/portal/me returns safe profile fields only', async () => {
    const me = await portalPatients.getMe(principal());
    expect(me.id).toBe(patientId);
    expect(me.firstName).toBe('Portal');
    expect(me.phone).toBeTruthy();
    expect(me).not.toHaveProperty('passwordHash');
    expect(me).not.toHaveProperty('mergedIntoPatientId');
    expect(me).not.toHaveProperty('anonymizedAt');
    expect(me).not.toHaveProperty('isAtRisk');
  });

  itDb('portal principal guard rejects anonymized patient with valid JWT shape', async () => {
    await prisma.patient.update({
      where: { id: patientId },
      data: { anonymizedAt: null },
    });
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: principal() }),
      }),
    } as ExecutionContext;
    await expect(portalPrincipalGuard.canActivate(ctx)).resolves.toBe(true);

    await prisma.patient.update({
      where: { id: patientId },
      data: { anonymizedAt: new Date() },
    });
    await expect(portalPrincipalGuard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await prisma.patient.update({
      where: { id: patientId },
      data: { anonymizedAt: null },
    });
  });

  itDb('patient sees only own appointments and cannot access others', async () => {
    const startAt = '2027-03-01T10:00:00.000Z';
    const endAt = '2027-03-01T10:15:00.000Z';

    const own = await appointmentsService.createForPortalPatient(principal(), {
      branchId,
      resourceIds: [resourceId],
      startAt,
      endAt,
      reason: 'Checkup',
    });
    expect(own.patientId).toBe(patientId);

    const otherAppt = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId,
        patientId: (
          await prisma.patient.create({
            data: {
              hospitalId,
              branchId,
              firstName: 'Sibling',
              lastName: 'Patient',
              phone: canonicalizePatientPhone(
                `99887${runId.replace(/\D/g, '').slice(-5)}`.slice(0, 10),
              ),
            },
          })
        ).id,
        startAt: new Date('2027-03-02T10:00:00.000Z'),
        endAt: new Date('2027-03-02T10:15:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      },
    });

    const list = await appointmentsService.findAllForPortalPatient(principal(), {});
    expect(list.items.every((a) => a.patientId === patientId)).toBe(true);
    expect(list.items.some((a) => a.id === own.id)).toBe(true);
    expect(list.items.some((a) => a.id === otherAppt.id)).toBe(false);

    await expect(
      appointmentsService.findOneForPortalPatient(principal(), otherAppt.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb('invalid booking rule duration and resource conflict rejected', async () => {
    await expect(
      appointmentsService.createForPortalPatient(principal(), {
        branchId,
        resourceIds: [resourceId],
        startAt: '2027-04-01T10:00:00.000Z',
        endAt: '2027-04-01T10:10:00.000Z',
      }),
    ).rejects.toThrow(/duration/i);

    await appointmentsService.createForPortalPatient(principal(), {
      branchId,
      resourceIds: [resourceId],
      startAt: '2027-04-02T10:00:00.000Z',
      endAt: '2027-04-02T10:15:00.000Z',
    });

    await expect(
      appointmentsService.createForPortalPatient(principal(), {
        branchId,
        resourceIds: [resourceId],
        startAt: '2027-04-02T10:00:00.000Z',
        endAt: '2027-04-02T10:15:00.000Z',
      }),
    ).rejects.toThrow(/conflict|Conflict|scheduling/i);
  });

  itDb('concurrent booking remains safe for same slot', async () => {
    const startAt = '2027-05-01T11:00:00.000Z';
    const endAt = '2027-05-01T11:15:00.000Z';
    const input = {
      branchId,
      resourceIds: [resourceId],
      startAt,
      endAt,
    };
    const results = await Promise.allSettled([
      appointmentsService.createForPortalPatient(principal(), input),
      appointmentsService.createForPortalPatient(principal(), input),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  itDb('cancel and reschedule enforce ownership and booking rules', async () => {
    const created = await appointmentsService.createForPortalPatient(principal(), {
      branchId,
      resourceIds: [resourceId],
      startAt: '2027-06-01T09:00:00.000Z',
      endAt: '2027-06-01T09:15:00.000Z',
    });

    const otherAppt = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId,
        patientId: (
          await prisma.patient.create({
            data: {
              hospitalId,
              branchId,
              firstName: 'Cancel',
              lastName: 'Other',
              phone: canonicalizePatientPhone(
                `88776${runId.replace(/\D/g, '').slice(-5)}`.slice(0, 10),
              ),
            },
          })
        ).id,
        startAt: new Date('2027-06-02T09:00:00.000Z'),
        endAt: new Date('2027-06-02T09:15:00.000Z'),
      },
    });

    await expect(
      appointmentsService.cancelForPortalPatient(principal(), otherAppt.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const rescheduled = await appointmentsService.updateForPortalPatient(
      principal(),
      created.id,
      {
        startAt: '2027-06-01T10:00:00.000Z',
        endAt: '2027-06-01T10:15:00.000Z',
        resourceIds: [resourceId],
      },
    );
    expect(rescheduled.startAt).toBe('2027-06-01T10:00:00.000Z');

    const cancelled = await appointmentsService.cancelForPortalPatient(
      principal(),
      created.id,
    );
    expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);
  });

  itDb('cross-hospital appointment access fails', async () => {
    const foreignAppt = await prisma.appointment.create({
      data: {
        hospitalId: otherHospitalId,
        patientId: otherPatientId,
        startAt: new Date('2027-07-01T09:00:00.000Z'),
        endAt: new Date('2027-07-01T09:15:00.000Z'),
      },
    });
    await expect(
      appointmentsService.findOneForPortalPatient(principal(), foreignAppt.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb('staff appointment creation still emits booked events', async () => {
    const staffUser = {
      sub: staffUserId,
      hospitalId,
      branchId: null as string | null,
    };
    const appt = await appointmentsService.create(staffUser, {
      patientId,
      branchId,
      resourceIds: [resourceId],
      startAt: '2027-08-01T09:00:00.000Z',
      endAt: '2027-08-01T09:15:00.000Z',
    });
    const outbox = await prisma.domainEventOutbox.findFirst({
      where: {
        hospitalId,
        entityId: appt.id,
        eventType: APPOINTMENT_BOOKED_EVENT_TYPE,
      },
    });
    expect(outbox).toBeTruthy();
  });

  itDb('slot discovery avoids conflicts and rejects invalid resource', async () => {
    await appointmentsService.createForPortalPatient(principal(), {
      branchId,
      resourceIds: [resourceId],
      startAt: '2027-09-01T14:00:00.000Z',
      endAt: '2027-09-01T14:15:00.000Z',
    });

    const slots = await appointmentsService.findAvailableSlotsForPortal({
      hospitalId,
      branchId,
      resourceIds: [resourceId],
      date: '2027-09-01',
      durationMinutes: 15,
    });
    expect(slots.note).toMatch(/resource conflict/i);
    const conflictSlot = slots.slots.find(
      (s) => s.startAt === '2027-09-01T14:00:00.000Z',
    );
    expect(conflictSlot).toBeUndefined();

    await expect(
      appointmentsService.findAvailableSlotsForPortal({
        hospitalId,
        resourceIds: ['00000000-0000-0000-0000-000000000099'],
        date: '2027-09-01',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
