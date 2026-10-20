import './support/abdm-e2e-mock-env';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AbdmConsentStatus,
  Gender,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AbdmModule } from '../src/abdm/abdm.module';
import { AuditModule } from '../src/audit/audit.module';
import { AuthModule } from '../src/auth/auth.module';
import { CommonModule } from '../src/common/common.module';
import { PlansModule } from '../src/plans/plans.module';
import {
  authorizationHeader,
  StaffHttpAuthUser,
} from './support/staff-auth-http.util';
import {
  collectIsolatedDatabaseEvidence,
  IsolatedDatabaseEvidence,
} from './support/isolated-test-database.util';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AuditModule,
    AuthModule,
    PlansModule,
    AbdmModule,
  ],
})
class AbdmStaffRoutesHttpE2eModule {}

describe('ABDM staff routes (HTTP e2e, mock mode)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let dbEvidence: IsolatedDatabaseEvidence | null = null;
  let fetchSpy: jest.SpyInstance;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdConsentIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdAuditLogIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdHospitalIds: string[] = [];

  let hospitalId: string;
  let patientId: string;
  let deniedRoleId: string;
  let allowedRoleId: string;
  let deniedUserId: string;
  let allowedUserId: string;

  const MOCK_HFR_ID = 'IN3410000261';
  const MOCK_ABHA_NUMBER = '12345678901234';

  const deniedActor = (): StaffHttpAuthUser => ({
    sub: deniedUserId,
    hospitalId,
    branchId: null,
    roleId: deniedRoleId,
    role: 'ABDM_DENIED',
  });

  const allowedActor = (): StaffHttpAuthUser => ({
    sub: allowedUserId,
    hospitalId,
    branchId: null,
    roleId: allowedRoleId,
    role: 'ABDM_STAFF',
  });

  beforeAll(async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error(
        'Unexpected outbound fetch during ABDM staff HTTP e2e (mock mode must not call ABDM)',
      );
    });

    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      return;
    }

    dbEvidence = await collectIsolatedDatabaseEvidence(databaseUrl);
    if (!dbEvidence.isolated) {
      return;
    }

    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    await prisma.$connect();

    const hospital = await prisma.hospital.create({
      data: {
        name: `ABDM HTTP e2e ${runId}`,
        code: `ABDMH-${runId}`,
      },
    });
    hospitalId = hospital.id;
    createdHospitalIds.push(hospital.id);

    deniedRoleId = (
      await prisma.role.create({
        data: {
          hospitalId,
          name: `AbdmDenied-${runId}`,
          description: 'no abdm permissions',
        },
      })
    ).id;
    createdRoleIds.push(deniedRoleId);

    allowedRoleId = (
      await prisma.role.create({
        data: {
          hospitalId,
          name: `AbdmAllowed-${runId}`,
          description: 'abdm permissions',
        },
      })
    ).id;
    createdRoleIds.push(allowedRoleId);

    await upsertAbdmPermissions();
    await grant(allowedRoleId, 'abdm:read');
    await grant(allowedRoleId, 'abdm:manage');
    await grant(allowedRoleId, 'abdm:consent:read');
    await grant(allowedRoleId, 'abdm:consent:manage');

    deniedUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          roleId: deniedRoleId,
          name: 'ABDM denied user',
          email: `abdm-denied-${runId}@example.com`,
          passwordHash: 'hash',
        },
      })
    ).id;
    createdUserIds.push(deniedUserId);

    allowedUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          roleId: allowedRoleId,
          name: 'ABDM allowed user',
          email: `abdm-allowed-${runId}@example.com`,
          passwordHash: 'hash',
        },
      })
    ).id;
    createdUserIds.push(allowedUserId);

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        firstName: 'Abdm',
        lastName: 'Patient',
        phone: `9${runId.replace(/\D/g, '').slice(0, 9)}`.slice(0, 10),
        gender: Gender.MALE,
        dateOfBirth: new Date('1990-06-15T00:00:00.000Z'),
      },
    });
    patientId = patient.id;
    createdPatientIds.push(patient.id);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AbdmStaffRoutesHttpE2eModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    fetchSpy?.mockRestore();

    if (app) {
      await app.close();
    }
    if (!dbEvidence?.isolated || !prisma) {
      return;
    }
    try {
      if (createdConsentIds.length > 0) {
        await prisma.abdmConsentAuditLog.deleteMany({
          where: { consentId: { in: createdConsentIds } },
        });
        await prisma.abdmConsent.deleteMany({
          where: { id: { in: createdConsentIds } },
        });
      }
      if (createdPatientIds.length > 0) {
        await prisma.patientAbhaLink.deleteMany({
          where: { patientId: { in: createdPatientIds } },
        });
        await prisma.abdmConsent.deleteMany({
          where: { patientId: { in: createdPatientIds } },
        });
        await prisma.patient.deleteMany({
          where: { id: { in: createdPatientIds } },
        });
      }
      await prisma.abdmHospitalConfig.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      if (createdAuditLogIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { id: { in: createdAuditLogIds } },
        });
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      if (createdRoleIds.length > 0) {
        await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      }
      if (createdHospitalIds.length > 0) {
        await prisma.hospital.deleteMany({
          where: { id: { in: createdHospitalIds } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function upsertAbdmPermissions() {
    const permissions = [
      { name: 'abdm:read', description: 'View ABDM configuration and links' },
      { name: 'abdm:manage', description: 'Manage ABDM configuration and links' },
      {
        name: 'abdm:consent:read',
        description: 'View ABDM consent records',
      },
      {
        name: 'abdm:consent:manage',
        description: 'Manage ABDM consent records',
      },
    ];
    for (const entry of permissions) {
      await prisma.permission.upsert({
        where: { name: entry.name },
        update: { description: entry.description },
        create: entry,
      });
    }
  }

  async function grant(roleId: string, permissionName: string) {
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { name: permissionName },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId: permission.id },
      },
      update: {},
      create: { roleId, permissionId: permission.id },
    });
  }

  const itWithIsolatedDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbEvidence?.isolated) {
        pending(
          dbEvidence?.reason ??
            'HTTP integration writes require isolated medios_test database',
        );
        return;
      }
      await fn();
    });
  };

  it('documents database isolation and mock-mode safeguards', () => {
    expect(dbEvidence).not.toBeNull();
    if (!dbEvidence?.isolated) {
      pending(dbEvidence?.reason ?? 'isolated database not verified');
      return;
    }
    expect(dbEvidence.activeDatabaseName).toBe('medios_test');
    expect(process.env.ABDM_MOCK_MODE).toBe('true');
    expect(fetchSpy).toBeDefined();
  });

  itWithIsolatedDb('rejects unauthenticated GET /abdm/environment with 401', async () => {
    await request(app.getHttpServer()).get('/abdm/environment').expect(401);
  });

  itWithIsolatedDb(
    'returns 403 when the user lacks abdm:read on GET /abdm/environment',
    async () => {
      await request(app.getHttpServer())
        .get('/abdm/environment')
        .set(authorizationHeader(deniedActor()))
        .expect(403)
        .expect((response) => {
          expect(response.body.message).toBe('Insufficient permissions');
        });
    },
  );

  itWithIsolatedDb('GET /abdm/environment reports sandbox mock mode', async () => {
    const response = await request(app.getHttpServer())
      .get('/abdm/environment')
      .set(authorizationHeader(allowedActor()))
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        environment: 'SANDBOX',
        mockMode: true,
        requestTimeoutMs: expect.any(Number),
      }),
    );
    expect(response.body.baseUrlConfigured).toBe(false);
  });

  itWithIsolatedDb('GET and PATCH /abdm/config persist hospital-scoped settings', async () => {
    const baseline = await request(app.getHttpServer())
      .get('/abdm/config')
      .set(authorizationHeader(allowedActor()))
      .expect(200);

    expect(baseline.body.hospitalId).toBe(hospitalId);
    expect(baseline.body.hipId).toBeNull();

    const hipId = `HIP-E2E-${runId.slice(0, 6)}`;
    await request(app.getHttpServer())
      .patch('/abdm/config')
      .set(authorizationHeader(allowedActor()))
      .send({
        hipId,
        hfrStatus: 'PENDING',
        hipStatus: 'PENDING',
        notes: `e2e ${runId}`,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.hipId).toBe(hipId);
        expect(response.body.notes).toBe(`e2e ${runId}`);
      });

    const after = await request(app.getHttpServer())
      .get('/abdm/config')
      .set(authorizationHeader(allowedActor()))
      .expect(200);

    expect(after.body.hipId).toBe(hipId);
  });

  itWithIsolatedDb('POST /abdm/hfr/search returns mock registry results', async () => {
    const response = await request(app.getHttpServer())
      .post('/abdm/hfr/search')
      .set(authorizationHeader(allowedActor()))
      .send({ facilityId: MOCK_HFR_ID, page: 1 })
      .expect(201);

    expect(response.body.mock).toBe(true);
    expect(response.body.facilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ facilityId: MOCK_HFR_ID }),
      ]),
    );
  });

  itWithIsolatedDb(
    'POST /abdm/hfr/link with registry verification links mock HFR',
    async () => {
      await request(app.getHttpServer())
        .post('/abdm/hfr/link')
        .set(authorizationHeader(allowedActor()))
        .send({ hfrId: MOCK_HFR_ID, verifyWithRegistry: true })
        .expect(201)
        .expect((response) => {
          expect(response.body.hfrId).toBe(MOCK_HFR_ID);
          expect(response.body.hfrStatus).toBe('REGISTERED');
        });

      const hfr = await request(app.getHttpServer())
        .get('/abdm/hfr')
        .set(authorizationHeader(allowedActor()))
        .expect(200);

      expect(hfr.body.hfrId).toBe(MOCK_HFR_ID);
    },
  );

  itWithIsolatedDb('POST /patients/:id/abha/link completes in mock mode', async () => {
    const response = await request(app.getHttpServer())
      .post(`/patients/${patientId}/abha/link`)
      .set(authorizationHeader(allowedActor()))
      .send({ abhaNumber: MOCK_ABHA_NUMBER })
      .expect(201);

    expect(response.body.abhaId).toBe(MOCK_ABHA_NUMBER);
    expect(response.body.link.linkStatus).toBe('LINKED');
    expect(response.body.link.linkToken).toBeUndefined();
  });

  itWithIsolatedDb(
    'POST consent DRAFT and GET by id return persisted consent',
    async () => {
      const create = await request(app.getHttpServer())
        .post(`/patients/${patientId}/abdm/consents`)
        .set(authorizationHeader(allowedActor()))
        .send({
          purpose: 'CareManagement',
          hiTypes: ['Prescription'],
          status: AbdmConsentStatus.DRAFT,
        })
        .expect(201);

      expect(create.body.status).toBe(AbdmConsentStatus.DRAFT);
      expect(create.body.patientId).toBe(patientId);
      createdConsentIds.push(create.body.id);

      const fetched = await request(app.getHttpServer())
        .get(`/abdm/consents/${create.body.id}`)
        .set(authorizationHeader(allowedActor()))
        .expect(200);

      expect(fetched.body.id).toBe(create.body.id);
      expect(fetched.body.status).toBe(AbdmConsentStatus.DRAFT);
      expect(fetched.body.purpose).toBe('CareManagement');
    },
  );
});
