import {
  AppointmentStatus,
  PatientAtRiskStatus,
  PatientEngagementActionStatus,
  PatientEngagementActionType,
  PatientNpsCategory,
  PatientPrivacyConsentStatus,
  PatientPrivacyConsentType,
  PatientPrivacyPurpose,
  PatientWinbackCampaignStatus,
  PrismaClient,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import { bootstrapHospitalEnterprisePlan } from '../plans/plan-bootstrap.util';
import { FeatureGateService } from '../plans/feature-gate.service';
import { FeatureKey } from '../plans/feature-keys';
import { PatientsService } from '../patients/patients.service';
import { AppointmentsService } from '../scheduling/appointments/appointments.service';
import { SchedulingPolicyService } from '../scheduling/scheduling-policy.service';
import { PatientEngagementActionService } from './patient-engagement-action.service';
import { PatientEngagementAppointmentService } from './patient-engagement-appointment.service';
import { PatientNpsService } from './patient-nps.service';
import { PatientWinbackService } from './patient-winback.service';
import { WhatsappBroadcastSegmentationService } from './whatsapp-broadcast-segmentation.service';
import { PatientNpsTriggerHandler } from '../jobs/handlers/patient-nps-trigger.handler';
import { PatientWinbackHandler } from '../jobs/handlers/patient-winback.handler';

describe('Patient engagement integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchA: string;
  let branchB: string;
  let staffUserId: string;
  let patientId: string;
  let patientBranchBId: string;
  let otherHospitalPatientId: string;

  let patientsService: PatientsService;
  let appointmentsService: AppointmentsService;
  let actionService: PatientEngagementActionService;
  let npsService: PatientNpsService;
  let winbackService: PatientWinbackService;
  let jobService: JobService;
  let npsTriggerHandler: PatientNpsTriggerHandler;
  let winbackHandler: PatientWinbackHandler;
  let featureGate: FeatureGateService;

  const staffUser = (branchId: string | null = null) => ({
    sub: staffUserId,
    hospitalId,
    branchId,
  });

  const patientPrincipal = () => ({
    patientId,
    hospitalId,
    branchId: branchA,
    principalType: 'PATIENT' as const,
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
    jobService = new JobService(prisma as never);
    const outbox = new DomainEventOutboxService(prisma as never, jobService);
    const prefService = new PatientNotificationPreferenceService(prisma as never);
    actionService = new PatientEngagementActionService(
      prisma as never,
      audit,
      outbox,
    );
    npsService = new PatientNpsService(prisma as never, audit, actionService);
    winbackService = new PatientWinbackService(prisma as never, audit, jobService);
    const segmentation = new WhatsappBroadcastSegmentationService(
      outbox,
      prefService,
    );
    npsTriggerHandler = new PatientNpsTriggerHandler(prisma as never, outbox);
    winbackHandler = new PatientWinbackHandler(
      prisma as never,
      winbackService,
      segmentation,
    );
    featureGate = new FeatureGateService(prisma as never);

    patientsService = new PatientsService(
      prisma as never,
      audit,
      prefService,
      actionService,
    );
    appointmentsService = new AppointmentsService(
      prisma as never,
      audit,
      outbox,
      new PatientEngagementAppointmentService(jobService),
      new SchedulingPolicyService(prisma as never),
    );

    const hospital = await prisma.hospital.create({
      data: { name: `ENG ${runId}`, code: `ENG-${runId}` },
    });
    hospitalId = hospital.id;
    await bootstrapHospitalEnterprisePlan(prisma, hospitalId);

    const otherHospital = await prisma.hospital.create({
      data: { name: `ENGO ${runId}`, code: `ENGO-${runId}` },
    });
    otherHospitalId = otherHospital.id;
    await bootstrapHospitalEnterprisePlan(prisma, otherHospitalId);

    branchA = (
      await prisma.branch.create({
        data: { hospitalId, name: 'A', code: `EA-${runId}` },
      })
    ).id;
    branchB = (
      await prisma.branch.create({
        data: { hospitalId, name: 'B', code: `EB-${runId}` },
      })
    ).id;

    staffUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          roleId: (
            await prisma.role.create({
              data: { hospitalId, name: `ENG-R-${runId}` },
            })
          ).id,
          name: 'Eng Staff',
          email: `eng-${runId}@test.com`,
          passwordHash: 'hash',
        },
      })
    ).id;

    patientId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId: branchA,
          phone: `9${runId.slice(-9)}1`,
          firstName: 'Pat',
        },
      })
    ).id;

    patientBranchBId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId: branchB,
          phone: `9${runId.slice(-9)}2`,
          firstName: 'PatB',
        },
      })
    ).id;

    otherHospitalPatientId = (
      await prisma.patient.create({
        data: {
          hospitalId: otherHospitalId,
          phone: `9${runId.slice(-9)}3`,
          firstName: 'Other',
        },
      })
    ).id;

    await prisma.patientPrivacyConsent.create({
      data: {
        hospitalId,
        patientId,
        consentType: PatientPrivacyConsentType.PATIENT_PRIVACY,
        purpose: PatientPrivacyPurpose.COMMUNICATION,
        status: PatientPrivacyConsentStatus.GRANTED,
        version: '1',
        grantedAt: new Date(),
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

  async function createCompletedVisits(
    targetPatientId: string,
    daysAgoList: number[],
  ) {
    const now = Date.now();
    for (const daysAgo of daysAgoList) {
      const startAt = new Date(now - daysAgo * 86400000);
      await prisma.appointment.create({
        data: {
          hospitalId,
          branchId: branchA,
          patientId: targetPatientId,
          startAt,
          endAt: new Date(startAt.getTime() + 3600000),
          status: AppointmentStatus.COMPLETED,
        },
      });
    }
  }

  itWithDb('feature gate enables PATIENT_ENGAGEMENT on enterprise hospital', async () => {
    expect(await featureGate.isEnabled(hospitalId, FeatureKey.PATIENT_ENGAGEMENT)).toBe(
      true,
    );
  });

  itWithDb('at-risk evaluation creates OPEN follow-up action', async () => {
    await createCompletedVisits(patientId, [100, 80, 60]);
    await patientsService.evaluateAtRiskForSystemJob(
      {
        jobId: 'j1',
        jobType: JOB_TYPES.PATIENT_AT_RISK_EVALUATE,
        workerId: 'w1',
        hospitalId,
        branchId: null,
      },
      patientId,
    );

    const actions = await actionService.listActionsForPatient(
      staffUser(),
      patientId,
    );
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].status).toBe(PatientEngagementActionStatus.OPEN);
    expect(actions[0].type).toBe(PatientEngagementActionType.FOLLOW_UP);
  });

  itWithDb('insufficient history creates no engagement action', async () => {
    const lonePatient = await prisma.patient.create({
      data: {
        hospitalId,
        phone: `9${runId.slice(-9)}4`,
        firstName: 'Lone',
      },
    });
    await prisma.appointment.create({
      data: {
        hospitalId,
        patientId: lonePatient.id,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        status: AppointmentStatus.COMPLETED,
      },
    });
    await patientsService.evaluateAtRiskForSystemJob(
      {
        jobId: 'j2',
        jobType: JOB_TYPES.PATIENT_AT_RISK_EVALUATE,
        workerId: 'w1',
        hospitalId,
        branchId: null,
      },
      lonePatient.id,
    );
    const actions = await prisma.patientEngagementAction.findMany({
      where: { patientId: lonePatient.id },
    });
    expect(actions).toHaveLength(0);
  });

  itWithDb('completed appointment enqueues idempotent NPS trigger job', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 90000000),
        status: AppointmentStatus.SCHEDULED,
      },
    });

    await appointmentsService.update(staffUser(), appointment.id, {
      status: AppointmentStatus.COMPLETED,
    });
    await appointmentsService.update(staffUser(), appointment.id, {
      status: AppointmentStatus.COMPLETED,
    });

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId,
        type: JOB_TYPES.PATIENT_NPS_TRIGGER,
        idempotencyKey: `patient.nps.trigger:${appointment.id}`,
      },
    });
    expect(jobs).toHaveLength(1);
  });

  itWithDb('NPS trigger handler creates outbox notification handoff', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        status: AppointmentStatus.COMPLETED,
      },
    });

    const job = await jobService.enqueue({
      hospitalId,
      branchId: branchA,
      type: JOB_TYPES.PATIENT_NPS_TRIGGER,
      idempotencyKey: `patient.nps.trigger:${appointment.id}`,
      payload: { appointmentId: appointment.id },
      maxAttempts: 5,
    });

    await npsTriggerHandler.handle(job, { workerId: 'w-nps' });

    const outbox = await prisma.domainEventOutbox.findFirst({
      where: {
        hospitalId,
        idempotencyKey: `patient.nps.trigger:${appointment.id}`,
      },
    });
    expect(outbox).not.toBeNull();
  });

  itWithDb('portal NPS submission stores category and blocks duplicate', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        status: AppointmentStatus.COMPLETED,
      },
    });

    const response = await npsService.submitForPortalPatient(
      patientPrincipal(),
      appointment.id,
      { score: 6, comment: 'Could be better' },
    );
    expect(response.category).toBe(PatientNpsCategory.DETRACTOR);

    await expect(
      npsService.submitForPortalPatient(patientPrincipal(), appointment.id, {
        score: 9,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const detractorActions = await prisma.patientEngagementAction.findMany({
      where: {
        patientId,
        metadata: { path: ['npsResponseId'], equals: response.id },
      },
    });
    expect(detractorActions.length).toBe(1);
  });

  itWithDb('patient cannot submit NPS for another patient appointment', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId: patientBranchBId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        status: AppointmentStatus.COMPLETED,
      },
    });

    await expect(
      npsService.submitForPortalPatient(patientPrincipal(), appointment.id, {
        score: 8,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itWithDb('NPS summary calculates score from stored categories', async () => {
    const summary = await npsService.summaryForStaff(staffUser(), {});
    expect(summary.totalResponses).toBeGreaterThanOrEqual(1);
    expect(summary.detractorCount).toBeGreaterThanOrEqual(1);
    expect(summary.npsScore).not.toBeNull();
  });

  itWithDb('engagement act and dismiss persist state', async () => {
    const action = await prisma.patientEngagementAction.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        type: PatientEngagementActionType.FOLLOW_UP,
        status: PatientEngagementActionStatus.OPEN,
        suggestedAction: 'Call patient',
        metadata: { source: 'test' },
      },
    });

    const acted = await actionService.actOnAction(
      staffUser(),
      patientId,
      action.id,
    );
    expect(acted.status).toBe(PatientEngagementActionStatus.ACTED);

    const dismissAction = await prisma.patientEngagementAction.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        type: PatientEngagementActionType.FOLLOW_UP,
        status: PatientEngagementActionStatus.OPEN,
        metadata: { source: 'test2' },
      },
    });
    const dismissed = await actionService.dismissAction(
      staffUser(),
      patientId,
      dismissAction.id,
    );
    expect(dismissed.status).toBe(PatientEngagementActionStatus.DISMISSED);
  });

  itWithDb('branch-scoped staff cannot act on other branch action', async () => {
    const action = await prisma.patientEngagementAction.create({
      data: {
        hospitalId,
        branchId: branchB,
        patientId: patientBranchBId,
        type: PatientEngagementActionType.FOLLOW_UP,
        status: PatientEngagementActionStatus.OPEN,
        metadata: { source: 'branch-test' },
      },
    });

    await expect(
      actionService.actOnAction(staffUser(branchA), patientBranchBId, action.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  itWithDb('win-back selects lapsed at-risk patients and enqueues notifications', async () => {
    await prisma.patient.update({
      where: { id: patientId },
      data: {
        isAtRisk: true,
        atRiskStatus: PatientAtRiskStatus.AT_RISK,
      },
    });

    const campaign = await winbackService.requestWinback(staffUser(), {
      idempotencyKey: `wb-${runId}`,
      branchId: branchA,
    });

    const job = await prisma.job.findFirst({
      where: {
        hospitalId,
        type: JOB_TYPES.PATIENT_WINBACK,
        payload: { path: ['campaignId'], equals: campaign.id },
      },
    });
    expect(job).not.toBeNull();

    await winbackHandler.handle(job!, { workerId: 'w-wb' });

    const updatedCampaign = await prisma.patientWinbackCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(updatedCampaign.status).toBe(PatientWinbackCampaignStatus.COMPLETED);

    const outboxRows = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId,
        eventType: 'patient.winback.requested',
      },
    });
    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
  });

  itWithDb('invalid NPS score rejected', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        patientId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        status: AppointmentStatus.COMPLETED,
      },
    });

    await expect(
      npsService.submitForPortalPatient(patientPrincipal(), appointment.id, {
        score: 11,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
