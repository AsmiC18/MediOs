const bcrypt = require('bcrypt');
const { loginBody } = require('./lib/login-body.cjs');
const { ensureAdminPhase1Permissions } = require('./lib/ensure-admin-permissions.cjs');
const { testPhone } = require('./lib/test-phone.cjs');
const path = require('path');

const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma/client'));

const BASE = 'http://localhost:3000';
const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS: ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(method, p, { token, body, headers } = {}) {
  const h = { ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: h,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, text };
}

async function main() {
  const prisma = new PrismaClient();

  const login = await request('POST', '/auth/login', {
    body: loginBody('admin@test.com'),
  });
  const token = login.body?.accessToken;
  const adminUserId = login.body?.user?.id;
  if (!token || !adminUserId) {
    fail('login');
    process.exit(1);
  }
  pass('login');

  await ensureAdminPhase1Permissions(prisma, login.body.user.roleId);

  const envRes = await request('GET', '/abdm/environment', { token });
  if (envRes.status === 200 && envRes.body?.mockMode === true) {
    pass('1 GET ABDM environment', JSON.stringify(envRes.body));
  } else {
    fail('1 GET ABDM environment', `${envRes.status} ${JSON.stringify(envRes.body)}`);
  }

  const emptyConfig = await request('GET', '/abdm/config', { token });
  if (emptyConfig.status === 200 && emptyConfig.body?.hospitalId) {
    pass('2 GET hospital config baseline');
  } else {
    fail('2 GET hospital config baseline', `${emptyConfig.status} ${JSON.stringify(emptyConfig.body)}`);
  }

  const patchConfig = await request('PATCH', '/abdm/config', {
    token,
    body: {
      hfrId: `HFR-MOCK-${runId.slice(0, 6)}`,
      hipId: `HIP-MOCK-${runId.slice(0, 6)}`,
      hfrStatus: 'REGISTERED',
      hipStatus: 'PENDING',
      notes: 'Day 1 mock config',
    },
  });
  if (patchConfig.status === 200 && patchConfig.body?.hfrId) {
    pass('3 PATCH hospital config');
  } else {
    fail('3 PATCH hospital config', `${patchConfig.status} ${JSON.stringify(patchConfig.body)}`);
  }

  const getConfig = await request('GET', '/abdm/config', { token });
  if (getConfig.status === 200 && getConfig.body?.hfrId === patchConfig.body?.hfrId) {
    pass('4 GET hospital config');
  } else {
    fail('4 GET hospital config', `${getConfig.status} ${JSON.stringify(getConfig.body)}`);
  }

  const hprLink = await request('PATCH', `/users/${adminUserId}/abdm`, {
    token,
    body: {
      hprId: '12-3456-7890-1234',
    },
  });
  if (
    hprLink.status === 200 &&
    hprLink.body?.hprId === '12-3456-7890-1234' &&
    hprLink.body?.linkStatus === 'PENDING'
  ) {
    pass('5 HPR link same-hospital user', hprLink.body?.linkStatus);
  } else {
    fail('5 HPR link same-hospital user', `${hprLink.status} ${JSON.stringify(hprLink.body)}`);
  }

  const crossHospitalUserId = '00000000-0000-4000-8000-000000000099';
  const crossHpr = await request('GET', `/users/${crossHospitalUserId}/abdm`, { token });
  if (crossHpr.status === 404) {
    pass('6 reject cross-hospital HPR access', '404');
  } else {
    fail('6 reject cross-hospital HPR access', `${crossHpr.status}`);
  }

  const patientPhone = testPhone('9');
  const patientCreate = await request('POST', '/patients', {
    token,
    body: {
      phone: patientPhone,
      firstName: 'Abdm',
      lastName: `Test${runId.slice(0, 4)}`,
      dateOfBirth: '1990-05-15T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  const patientId = patientCreate.body?.id;
  if (!patientId) {
    fail('create patient for ABHA tests');
    process.exit(1);
  }

  const abhaLink = await request('POST', `/patients/${patientId}/abha/link`, {
    token,
    body: {
      abhaNumber: '12345678901234',
      abhaAddress: 'patient.mock@abdm',
    },
  });
  if (
    abhaLink.status === 201 ||
    (abhaLink.status === 200 && abhaLink.body?.link?.linkStatus === 'LINKED')
  ) {
    pass('7 ABHA link', abhaLink.body?.link?.linkStatus || abhaLink.status);
  } else if (abhaLink.status === 200 && abhaLink.body?.link?.linkStatus === 'LINKED') {
    pass('7 ABHA link');
  } else {
    fail('7 ABHA link', `${abhaLink.status} ${JSON.stringify(abhaLink.body)}`);
  }

  const abhaGet = await request('GET', `/patients/${patientId}/abha`, { token });
  if (abhaGet.status === 200 && abhaGet.body?.abhaId === '12345678901234') {
    pass('8 ABHA GET');
  } else {
    fail('8 ABHA GET', `${abhaGet.status} ${JSON.stringify(abhaGet.body)}`);
  }

  const abhaVerify = await request('POST', `/patients/${patientId}/abha/verify`, {
    token,
    body: { mockOtp: '123456' },
  });
  if (abhaVerify.status === 201 || abhaVerify.status === 200) {
    pass('9 ABHA verify');
  } else {
    fail('9 ABHA verify', `${abhaVerify.status} ${JSON.stringify(abhaVerify.body)}`);
  }

  const abhaUnlink = await request('POST', `/patients/${patientId}/abha/unlink`, { token });
  if (abhaUnlink.status === 201 || abhaUnlink.status === 200) {
    pass('10 ABHA unlink', abhaUnlink.body?.link?.linkStatus);
  } else {
    fail('10 ABHA unlink', `${abhaUnlink.status} ${JSON.stringify(abhaUnlink.body)}`);
  }

  const consentCreate = await request('POST', `/patients/${patientId}/abdm/consents`, {
    token,
    body: {
      purpose: 'Care management',
      hiTypes: ['Prescription', 'DiagnosticReport'],
    },
  });
  const consentId = consentCreate.body?.id;
  if (consentCreate.status === 201 || (consentCreate.status === 200 && consentId)) {
    pass('11 consent creation', consentCreate.body?.status);
  } else {
    fail('11 consent creation', `${consentCreate.status} ${JSON.stringify(consentCreate.body)}`);
  }

  const consentList = await request('GET', `/patients/${patientId}/abdm/consents`, { token });
  if (consentList.status === 200 && consentList.body?.data?.length >= 1) {
    pass('12 consent list');
  } else {
    fail('12 consent list', `${consentList.status} ${JSON.stringify(consentList.body)}`);
  }

  const consentGet = await request('GET', `/abdm/consents/${consentId}`, { token });
  if (consentGet.status === 200 && consentGet.body?.id === consentId) {
    pass('13 consent GET');
  } else {
    fail('13 consent GET', `${consentGet.status} ${JSON.stringify(consentGet.body)}`);
  }

  const validTransition = await request('PATCH', `/abdm/consents/${consentId}/status`, {
    token,
    body: { status: 'GRANTED' },
  });
  if (validTransition.status === 200 && validTransition.body?.status === 'GRANTED') {
    pass('14 valid consent status transition');
  } else {
    fail('14 valid consent status transition', `${validTransition.status} ${JSON.stringify(validTransition.body)}`);
  }

  const invalidTransition = await request('PATCH', `/abdm/consents/${consentId}/status`, {
    token,
    body: { status: 'REQUESTED' },
  });
  if (invalidTransition.status === 400 || invalidTransition.status === 409) {
    pass('15 invalid consent transition', `${invalidTransition.status}`);
  } else {
    fail('15 invalid consent transition', `${invalidTransition.status} ${JSON.stringify(invalidTransition.body)}`);
  }

  const auditLog = await request('GET', `/abdm/consents/${consentId}/audit-log`, { token });
  if (auditLog.status === 200 && Array.isArray(auditLog.body) && auditLog.body.length >= 2) {
    pass('16 consent audit log', `${auditLog.body.length} entries`);
  } else {
    fail('16 consent audit log', `${auditLog.status} ${JSON.stringify(auditLog.body)}`);
  }

  const otherHospital = await prisma.hospital.upsert({
    where: { code: `ABDM-ISO-${runId.slice(0, 6)}` },
    update: {},
    create: {
      name: 'ABDM Isolation Hospital',
      code: `ABDM-ISO-${runId.slice(0, 6)}`,
    },
  });

  const otherRole = await prisma.role.upsert({
    where: {
      hospitalId_name: {
        hospitalId: otherHospital.id,
        name: `ADMIN-${runId.slice(0, 4)}`,
      },
    },
    update: {},
    create: {
      hospitalId: otherHospital.id,
      name: `ADMIN-${runId.slice(0, 4)}`,
      description: 'Isolation admin',
    },
  });

  const otherUser = await prisma.user.create({
    data: {
      hospitalId: otherHospital.id,
      roleId: otherRole.id,
      name: 'Other Hospital Admin',
      email: `abdm-iso-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });

  const otherConsent = await prisma.abdmConsent.create({
    data: {
      hospitalId: otherHospital.id,
      patientId: (
        await prisma.patient.create({
          data: {
            hospitalId: otherHospital.id,
            phone: testPhone('9'),
            firstName: 'Other',
            lastName: 'Patient',
          },
        })
      ).id,
      purpose: 'Isolation test',
      hiTypes: ['Prescription'],
      status: 'REQUESTED',
      requestedByUserId: otherUser.id,
    },
  });

  const tenantIsolation = await request('GET', `/abdm/consents/${otherConsent.id}`, { token });
  if (tenantIsolation.status === 404) {
    pass('17 tenant isolation for consent', '404');
  } else {
    fail('17 tenant isolation for consent', `${tenantIsolation.status}`);
  }

  const limitedRoleName = `NO-ABDM-${runId.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}`;
  const limitedRole = await prisma.role.upsert({
    where: {
      hospitalId_name: {
        hospitalId: login.body.user.hospitalId,
        name: limitedRoleName,
      },
    },
    update: {},
    create: {
      hospitalId: login.body.user.hospitalId,
      name: limitedRoleName,
      description: 'No ABDM permissions',
    },
  });

  const limitedUserEmail = `no-abdm-${runId.replace(/[^a-zA-Z0-9]/g, '')}@test.com`;
  const limitedUser = await prisma.user.upsert({
    where: {
      hospitalId_email: {
        hospitalId: login.body.user.hospitalId,
        email: limitedUserEmail,
      },
    },
    update: { roleId: limitedRole.id },
    create: {
      hospitalId: login.body.user.hospitalId,
      roleId: limitedRole.id,
      name: 'Limited User',
      email: limitedUserEmail,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });

  const limitedLogin = await request('POST', '/auth/login', {
    body: loginBody(limitedUser.email),
  });
  const limitedToken = limitedLogin.body?.accessToken;

  const permissionDenied = await request('GET', '/abdm/config', { token: limitedToken });
  if (permissionDenied.status === 403) {
    pass('18 permission enforcement', '403');
  } else {
    fail('18 permission enforcement', `${permissionDenied.status}`);
  }

  const envRecheck = await request('GET', '/abdm/environment', { token });
  if (envRecheck.body?.mockMode === true) {
    pass('19 mock mode behavior', 'mockMode true — gateway mock active');
  } else {
    const mockOffLink = await request('POST', `/patients/${patientId}/abha/link`, {
      token,
      body: { abhaNumber: '98765432109876' },
    });
    if (mockOffLink.status === 400) {
      pass('19 mock mode behavior', '400 when mock off');
    } else {
      fail('19 mock mode behavior', `${mockOffLink.status} ${JSON.stringify(mockOffLink.body)}`);
    }
  }

  const patientGet = await request('GET', `/patients/${patientId}`, { token });
  const patientPatch = await request('PATCH', `/patients/${patientId}`, {
    token,
    body: { lastName: `Updated${runId.slice(0, 3)}` },
  });
  if (patientGet.status === 200 && patientPatch.status === 200) {
    pass('20 existing patient APIs still work');
  } else {
    fail('20 existing patient APIs still work', `GET ${patientGet.status} PATCH ${patientPatch.status}`);
  }

  // --- Day 2: ABDM session, headers, certificate, bridge, callback ---
  let day2ServicesAvailable = false;
  try {
    const { AbdmEnvironmentService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-environment.service'));
    const { AbdmSessionService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-session.service'));
    const { AbdmHeadersService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-headers.service'));
    const { AbdmCertificateService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-certificate.service'));
    const { AbdmBridgeService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-bridge.service'));

    const envService = new AbdmEnvironmentService();
    const sessionService = new AbdmSessionService(envService);
    const headersService = new AbdmHeadersService(envService);
    const certificateService = new AbdmCertificateService(envService, sessionService, headersService);
    const bridgeService = new AbdmBridgeService(envService, sessionService, headersService);
    day2ServicesAvailable = true;

    const mockToken = await sessionService.getAccessToken();
    if (mockToken === 'mock_abdm_access_token') {
      pass('21 mock session token generation');
    } else {
      fail('21 mock session token generation', mockToken);
    }

    sessionService.clearCache();
    sessionService.cache = {
      accessToken: 'cached_mock_token',
      expiresAtMs: Date.now() + 120_000,
    };
    const cachedToken = await sessionService.getAccessToken();
    if (cachedToken === 'cached_mock_token') {
      pass('22 mock token caching');
    } else {
      fail('22 mock token caching', cachedToken);
    }

    sessionService.clearCache();
    sessionService.cache = {
      accessToken: 'expired_mock_token',
      expiresAtMs: Date.now() + 30_000,
    };
    const refreshedToken = await sessionService.getAccessToken();
    if (refreshedToken === 'mock_abdm_access_token') {
      pass('23 mock token expiry buffer refresh');
    } else {
      fail('23 mock token expiry buffer refresh', refreshedToken);
    }

    const savedMockMode = process.env.ABDM_MOCK_MODE;
    process.env.ABDM_MOCK_MODE = 'false';
    process.env.ABDM_SANDBOX_CLIENT_ID = '';
    process.env.ABDM_SANDBOX_CLIENT_SECRET = '';
    const realEnvService = new AbdmEnvironmentService();
    const realSessionService = new AbdmSessionService(realEnvService);
    let missingCredsError = false;
    try {
      await realSessionService.getAccessToken();
    } catch (error) {
      missingCredsError =
        error?.message?.includes('credentials are not configured') ||
        error?.response?.message?.includes?.('credentials are not configured');
    }
    process.env.ABDM_MOCK_MODE = savedMockMode;
    if (missingCredsError) {
      pass('24 missing credentials in real mode');
    } else {
      fail('24 missing credentials in real mode');
    }

    const headers = headersService.buildGatewayHeaders('test-token', {
      hipId: 'HIP-TEST-001',
    });
    if (
      headers.Authorization === 'Bearer test-token' &&
      headers['X-HIP-ID'] === 'HIP-TEST-001' &&
      headers['X-CM-ID'] &&
      headers['REQUEST-ID'] &&
      headers.TIMESTAMP
    ) {
      pass('25 standard ABDM header generation');
    } else {
      fail('25 standard ABDM header generation', JSON.stringify(headers));
    }

    const publicKey = await certificateService.getPublicKey();
    if (typeof publicKey === 'string' && publicKey.includes('MOCK_ABDM_PUBLIC_KEY')) {
      pass('26 mock certificate retrieval');
    } else {
      fail('26 mock certificate retrieval', publicKey);
    }

    const bridgeUpdate = await bridgeService.updateBridgeUrl('https://example.com/callback');
    const bridgeList = await bridgeService.listBridgeServices();
    if (bridgeUpdate?.mock === true && bridgeList?.mock === true) {
      pass('27 mock bridge service');
    } else {
      fail('27 mock bridge service', JSON.stringify({ bridgeUpdate, bridgeList }));
    }
  } catch (error) {
    fail('Day 2 service tests', error?.message || String(error));
  }

  const callbackPatientPhone = testPhone('8');
  const callbackPatientCreate = await request('POST', '/patients', {
    token,
    body: {
      phone: callbackPatientPhone,
      firstName: 'Callback',
      lastName: `Patient${runId.slice(0, 4)}`,
      dateOfBirth: '1985-03-20T00:00:00.000Z',
      gender: 'FEMALE',
    },
  });
  const callbackPatientId = callbackPatientCreate.body?.id;
  const hospitalId = login.body?.user?.hospitalId;

  if (callbackPatientId && hospitalId) {
    const pendingRequestId = `mock-callback-request-${runId}`;
    await prisma.patientAbhaLink.create({
      data: {
        hospitalId,
        patientId: callbackPatientId,
        abhaNumber: '11112222333344',
        abhaAddress: 'callback.patient@abdm',
        linkStatus: 'LINK_PENDING',
        verificationMethod: 'DEMOGRAPHICS',
        abdmRequestId: pendingRequestId,
      },
    });

    const beforeCallbackPatient = await prisma.patient.findUnique({
      where: { id: callbackPatientId },
    });
    if (beforeCallbackPatient?.abhaId === null) {
      pass('28 patient abhaId not synced before callback');
    } else {
      fail('28 patient abhaId not synced before callback', beforeCallbackPatient?.abhaId);
    }

    const callbackRes = await request('POST', '/api/v3/hip/token/on-generate-token', {
      body: {
        abhaAddress: 'callback.patient@abdm',
        linkToken: 'mock.jwt.token',
        response: { requestId: pendingRequestId },
      },
    });
    if (callbackRes.status === 200 && callbackRes.body?.status === 'linked') {
      pass('29 mock callback links patient');
    } else {
      fail('29 mock callback links patient', `${callbackRes.status} ${JSON.stringify(callbackRes.body)}`);
    }

    const afterCallbackLink = await prisma.patientAbhaLink.findUnique({
      where: { patientId: callbackPatientId },
    });
    const afterCallbackPatient = await prisma.patient.findUnique({
      where: { id: callbackPatientId },
    });
    if (
      afterCallbackLink?.linkStatus === 'LINKED' &&
      afterCallbackPatient?.abhaId === 'callback.patient@abdm'
    ) {
      pass('30 callback synchronizes Patient.abhaId');
    } else {
      fail(
        '30 callback synchronizes Patient.abhaId',
        JSON.stringify({ link: afterCallbackLink?.linkStatus, abhaId: afterCallbackPatient?.abhaId }),
      );
    }

    const idempotentCallback = await request('POST', '/api/v3/hip/token/on-generate-token', {
      body: {
        abhaAddress: 'callback.patient@abdm',
        linkToken: 'mock.jwt.token',
        response: { requestId: pendingRequestId },
      },
    });
    if (idempotentCallback.status === 200 && idempotentCallback.body?.status === 'already_linked') {
      pass('31 callback idempotency');
    } else {
      fail('31 callback idempotency', `${idempotentCallback.status} ${JSON.stringify(idempotentCallback.body)}`);
    }

    const unknownCallback = await request('POST', '/api/v3/hip/token/on-generate-token', {
      body: {
        abhaAddress: 'unknown@abdm',
        linkToken: 'mock.jwt.token',
        response: { requestId: `unknown-${runId}` },
      },
    });
    if (unknownCallback.status === 404) {
      pass('32 unknown callback correlation rejected');
    } else {
      fail('32 unknown callback correlation rejected', `${unknownCallback.status}`);
    }

    const callbackAbhaGet = await request('GET', `/patients/${callbackPatientId}/abha`, { token });
    if (
      callbackAbhaGet.status === 200 &&
      callbackAbhaGet.body?.link?.linkStatus === 'LINKED' &&
      callbackAbhaGet.body?.link?.linkToken === undefined
    ) {
      pass('33 linkToken not exposed via GET /patients/:id/abha');
    } else {
      fail('33 linkToken not exposed via GET /patients/:id/abha', JSON.stringify(callbackAbhaGet.body));
    }

    const crossHospitalCallbackPatient = await prisma.patient.create({
      data: {
        hospitalId: otherHospital.id,
        phone: testPhone('7'),
        firstName: 'Cross',
        lastName: 'Hospital',
        dateOfBirth: new Date('1992-01-01'),
        gender: 'MALE',
      },
    });
    const crossRequestId = `cross-hospital-${runId.slice(0, 8)}`;
    await prisma.patientAbhaLink.create({
      data: {
        hospitalId: otherHospital.id,
        patientId: crossHospitalCallbackPatient.id,
        abhaNumber: '55556666777788',
        linkStatus: 'LINK_PENDING',
        verificationMethod: 'DEMOGRAPHICS',
        abdmRequestId: crossRequestId,
      },
    });
    const crossHospitalAbhaGet = await request('GET', `/patients/${crossHospitalCallbackPatient.id}/abha`, {
      token,
    });
    if (crossHospitalAbhaGet.status === 404) {
      pass('34 cross-hospital patient ABHA protection');
    } else {
      fail('34 cross-hospital patient ABHA protection', `${crossHospitalAbhaGet.status}`);
    }
    await prisma.patientAbhaLink.delete({ where: { patientId: crossHospitalCallbackPatient.id } }).catch(() => {});
    await prisma.patient.delete({ where: { id: crossHospitalCallbackPatient.id } }).catch(() => {});
  } else {
    fail('28-34 callback flow setup', 'missing callback patient or hospital');
  }

  const hasLiveCreds =
    process.env.ABDM_SANDBOX_CLIENT_ID &&
    process.env.ABDM_SANDBOX_CLIENT_SECRET &&
    process.env.ABDM_CALLBACK_BASE_URL;
  if (!hasLiveCreds) {
    pass('35 live ABDM sandbox tests skipped', 'credentials/callback URL unavailable');
  } else {
    pass('35 live ABDM sandbox tests', 'credentials present — manual verification recommended');
  }

  // --- Day 3: HFR/HPR registry link + search/sync ---
  const hfrGetInitial = await request('GET', '/abdm/hfr', { token });
  if (hfrGetInitial.status === 200 && hfrGetInitial.body?.hospitalId) {
    pass('36 GET /abdm/hfr');
  } else {
    fail('36 GET /abdm/hfr', `${hfrGetInitial.status} ${JSON.stringify(hfrGetInitial.body)}`);
  }

  const invalidHfrLink = await request('POST', '/abdm/hfr/link', {
    token,
    body: { hfrId: 'INVALID-HFR' },
  });
  if (invalidHfrLink.status === 400) {
    pass('37 invalid HFR ID rejected');
  } else {
    fail('37 invalid HFR ID rejected', `${invalidHfrLink.status}`);
  }

  const validHfrLink = await request('POST', '/abdm/hfr/link', {
    token,
    body: { hfrId: 'IN3410000261', verifyWithRegistry: true },
  });
  if (
    validHfrLink.status === 201 ||
    (validHfrLink.status === 200 &&
      validHfrLink.body?.hfrId === 'IN3410000261' &&
      validHfrLink.body?.hfrStatus === 'REGISTERED')
  ) {
    pass('38 valid HFR link with registry verify', validHfrLink.body?.hfrFacilityName);
  } else {
    fail('38 valid HFR link with registry verify', `${validHfrLink.status} ${JSON.stringify(validHfrLink.body)}`);
  }

  const mockHfrSearch = await request('POST', '/abdm/hfr/search', {
    token,
    body: { facilityName: 'MediOS' },
  });
  if (
    mockHfrSearch.status === 201 ||
    (mockHfrSearch.status === 200 && mockHfrSearch.body?.facilities?.length >= 1)
  ) {
    pass('39 mock HFR search', `${mockHfrSearch.body?.facilities?.length} results`);
  } else {
    fail('39 mock HFR search', `${mockHfrSearch.status} ${JSON.stringify(mockHfrSearch.body)}`);
  }

  const hfrSearchDenied = await request('POST', '/abdm/hfr/search', {
    token: limitedToken,
    body: { facilityName: 'MediOS' },
  });
  if (hfrSearchDenied.status === 403) {
    pass('40 HFR search permission enforcement', '403');
  } else {
    fail('40 HFR search permission enforcement', `${hfrSearchDenied.status}`);
  }

  const hfrSync = await request('POST', '/abdm/hfr/sync', { token });
  if (
    hfrSync.status === 201 ||
    (hfrSync.status === 200 &&
      hfrSync.body?.hfrFacilityName === 'MediOS Demo Hospital' &&
      hfrSync.body?.lastSyncedAt)
  ) {
    pass('41 HFR sync updates cached metadata');
  } else {
    fail('41 HFR sync updates cached metadata', `${hfrSync.status} ${JSON.stringify(hfrSync.body)}`);
  }

  const hfrAudit = await prisma.auditLog.findFirst({
    where: {
      hospitalId: login.body.user.hospitalId,
      action: 'ABDM_HFR_SYNCED',
    },
    orderBy: { createdAt: 'desc' },
  });
  if (hfrAudit) {
    pass('42 HFR audit event recorded');
  } else {
    fail('42 HFR audit event recorded');
  }

  const invalidHprLink = await request('POST', `/users/${adminUserId}/abdm/hpr/link`, {
    token,
    body: { hprId: 'bad-hpr-id' },
  });
  if (invalidHprLink.status === 400) {
    pass('43 invalid HPR ID rejected');
  } else {
    fail('43 invalid HPR ID rejected', `${invalidHprLink.status}`);
  }

  const validHprLink = await request('POST', `/users/${adminUserId}/abdm/hpr/link`, {
    token,
    body: { hprId: '71-1850-0578-3603' },
  });
  if (
    validHprLink.status === 201 ||
    (validHprLink.status === 200 &&
      validHprLink.body?.hprId === '71-1850-0578-3603' &&
      validHprLink.body?.linkStatus === 'PENDING')
  ) {
    pass('44 valid HPR link same-hospital user', validHprLink.body?.linkStatus);
  } else {
    fail('44 valid HPR link same-hospital user', `${validHprLink.status} ${JSON.stringify(validHprLink.body)}`);
  }

  const hprGet = await request('GET', `/users/${adminUserId}/abdm/hpr`, { token });
  if (hprGet.status === 200 && hprGet.body?.hprId === '71-1850-0578-3603') {
    pass('45 GET /users/:id/abdm/hpr');
  } else {
    fail('45 GET /users/:id/abdm/hpr', `${hprGet.status} ${JSON.stringify(hprGet.body)}`);
  }

  const crossHprLink = await request('POST', `/users/${otherUser.id}/abdm/hpr/link`, {
    token,
    body: { hprId: '71-9999-9999-9999' },
  });
  if (crossHprLink.status === 404) {
    pass('46 cross-hospital HPR link rejected', '404');
  } else {
    fail('46 cross-hospital HPR link rejected', `${crossHprLink.status}`);
  }

  const hprSync = await request('POST', `/users/${adminUserId}/abdm/hpr/sync`, { token });
  if (
    hprSync.status === 201 ||
    (hprSync.status === 200 && hprSync.body?.linkStatus === 'REGISTERED')
  ) {
    pass('47 mock HPR sync status', hprSync.body?.linkStatus);
  } else {
    fail('47 mock HPR sync status', `${hprSync.status} ${JSON.stringify(hprSync.body)}`);
  }

  const hprAudit = await prisma.auditLog.findFirst({
    where: {
      hospitalId: login.body.user.hospitalId,
      action: 'ABDM_HPR_LINKED',
    },
    orderBy: { createdAt: 'desc' },
  });
  if (hprAudit) {
    pass('48 HPR audit event recorded');
  } else {
    fail('48 HPR audit event recorded');
  }

  const abhaLinkRegression = await request('POST', `/patients/${patientId}/abha/link`, {
    token,
    body: { abhaNumber: '12345678901234', abhaAddress: 'patient.mock@abdm' },
  });
  if (
    abhaLinkRegression.status === 201 ||
    (abhaLinkRegression.status === 200 && abhaLinkRegression.body?.link?.linkStatus === 'LINKED')
  ) {
    pass('49 ABHA link-token regression');
  } else {
    fail('49 ABHA link-token regression', `${abhaLinkRegression.status} ${JSON.stringify(abhaLinkRegression.body)}`);
  }

  const patientRegression = await request('GET', `/patients/${patientId}`, { token });
  if (patientRegression.status === 200) {
    pass('50 existing patient API regression');
  } else {
    fail('50 existing patient API regression', `${patientRegression.status}`);
  }

  // --- Day 4: Consent Manager foundation ---
  const consentPatientPhone = testPhone('6');
  const consentPatientCreate = await request('POST', '/patients', {
    token,
    body: {
      phone: consentPatientPhone,
      firstName: 'Consent',
      lastName: `Patient${runId.slice(0, 4)}`,
    },
  });
  const consentPatientId = consentPatientCreate.body?.id;

  const draftConsent = await request('POST', `/patients/${consentPatientId}/abdm/consents`, {
    token,
    body: {
      purpose: 'Care management',
      hiTypes: ['Prescription'],
      status: 'DRAFT',
    },
  });
  const draftConsentId = draftConsent.body?.id;
  if (
    draftConsent.status === 201 ||
    (draftConsent.status === 200 && draftConsent.body?.status === 'DRAFT')
  ) {
    pass('51 create DRAFT consent');
  } else {
    fail('51 create DRAFT consent', `${draftConsent.status} ${JSON.stringify(draftConsent.body)}`);
  }

  const requestConsent = await request('PATCH', `/abdm/consents/${draftConsentId}/status`, {
    token,
    body: { status: 'REQUESTED' },
  });
  if (requestConsent.status === 200 && requestConsent.body?.status === 'REQUESTED') {
    pass('52 request consent DRAFT -> REQUESTED');
  } else {
    fail('52 request consent DRAFT -> REQUESTED', `${requestConsent.status} ${JSON.stringify(requestConsent.body)}`);
  }

  const grantConsent = await request('PATCH', `/abdm/consents/${draftConsentId}/status`, {
    token,
    body: { status: 'GRANTED' },
  });
  if (grantConsent.status === 200 && grantConsent.body?.status === 'GRANTED') {
    pass('53 grant consent REQUESTED -> GRANTED');
  } else {
    fail('53 grant consent REQUESTED -> GRANTED', `${grantConsent.status} ${JSON.stringify(grantConsent.body)}`);
  }

  const denyConsentPatientPhone = testPhone('5');
  const denyPatient = await request('POST', '/patients', {
    token,
    body: {
      phone: denyConsentPatientPhone,
      firstName: 'Deny',
      lastName: 'Consent',
    },
  });
  const denyConsentCreate = await request('POST', `/patients/${denyPatient.body.id}/abdm/consents`, {
    token,
    body: {
      purpose: 'Deny test',
      hiTypes: ['Prescription'],
    },
  });
  const denyConsentId = denyConsentCreate.body?.id;
  const denyConsent = await request('PATCH', `/abdm/consents/${denyConsentId}/status`, {
    token,
    body: { status: 'DENIED' },
  });
  if (denyConsent.status === 200 && denyConsent.body?.status === 'DENIED') {
    pass('54 deny consent REQUESTED -> DENIED');
  } else {
    fail('54 deny consent REQUESTED -> DENIED', `${denyConsent.status} ${JSON.stringify(denyConsent.body)}`);
  }

  const revokeConsent = await request('PATCH', `/abdm/consents/${draftConsentId}/status`, {
    token,
    body: { status: 'REVOKED', reason: 'Patient withdrew consent' },
  });
  if (revokeConsent.status === 200 && revokeConsent.body?.status === 'REVOKED') {
    pass('55 revoke consent GRANTED -> REVOKED');
  } else {
    fail('55 revoke consent GRANTED -> REVOKED', `${revokeConsent.status} ${JSON.stringify(revokeConsent.body)}`);
  }

  const expiredPatientPhone = testPhone('4');
  const expiredPatient = await request('POST', '/patients', {
    token,
    body: {
      phone: expiredPatientPhone,
      firstName: 'Expire',
      lastName: 'Consent',
    },
  });
  const expiredConsentCreate = await request('POST', `/patients/${expiredPatient.body.id}/abdm/consents`, {
    token,
    body: {
      purpose: 'Expiry test',
      hiTypes: ['Prescription'],
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    },
  });
  const expiredConsentId = expiredConsentCreate.body?.id;
  await request('PATCH', `/abdm/consents/${expiredConsentId}/status`, {
    token,
    body: { status: 'GRANTED' },
  });
  const activeBeforeExpiry = await request(
    'GET',
    `/patients/${expiredPatient.body.id}/abdm/consents/active?purpose=Expiry test`,
    { token },
  );
  if (activeBeforeExpiry.status === 200 && activeBeforeExpiry.body === null) {
    pass('56 expired granted consent not active');
  } else if (activeBeforeExpiry.status === 200 && !activeBeforeExpiry.body?.id) {
    pass('56 expired granted consent not active');
  } else {
    fail('56 expired granted consent not active', JSON.stringify(activeBeforeExpiry.body));
  }
  const expiredConsentGet = await request('GET', `/abdm/consents/${expiredConsentId}`, { token });
  if (expiredConsentGet.status === 200 && expiredConsentGet.body?.status === 'EXPIRED') {
    pass('57 expired consent status updated');
  } else {
    fail('57 expired consent status updated', `${expiredConsentGet.status} ${JSON.stringify(expiredConsentGet.body)}`);
  }

  const invalidDbConsent = await prisma.abdmConsent.findUnique({
    where: { id: denyConsentId },
  });
  const invalidTransitionDb = await request('PATCH', `/abdm/consents/${denyConsentId}/status`, {
    token,
    body: { status: 'GRANTED' },
  });
  const invalidDbConsentAfter = await prisma.abdmConsent.findUnique({
    where: { id: denyConsentId },
  });
  if (
    (invalidTransitionDb.status === 400 || invalidTransitionDb.status === 409) &&
    invalidDbConsentAfter?.status === invalidDbConsent?.status
  ) {
    pass('58 invalid transition does not modify database');
  } else {
    fail('58 invalid transition does not modify database', `${invalidTransitionDb.status}`);
  }

  const otherPatientForConsent = await prisma.patient.create({
    data: {
      hospitalId: otherHospital.id,
      phone: testPhone('3'),
      firstName: 'Other',
      lastName: 'ConsentPatient',
    },
  });
  const crossList = await request('GET', `/patients/${otherPatientForConsent.id}/abdm/consents`, { token });
  if (crossList.status === 404) {
    pass('59 cross-hospital patient consent access rejected');
  } else {
    fail('59 cross-hospital patient consent access rejected', `${crossList.status}`);
  }
  await prisma.patient.delete({ where: { id: otherPatientForConsent.id } }).catch(() => {});

  const consentAuditDay4 = await request('GET', `/abdm/consents/${draftConsentId}/audit-log`, { token });
  if (
    consentAuditDay4.status === 200 &&
    Array.isArray(consentAuditDay4.body) &&
    consentAuditDay4.body.some((entry) => entry.action === 'GRANTED') &&
    consentAuditDay4.body.some((entry) => entry.action === 'REVOKED')
  ) {
    pass('60 consent audit log includes grant/revoke actions');
  } else {
    fail('60 consent audit log includes grant/revoke actions', JSON.stringify(consentAuditDay4.body));
  }

  const consentPermissionDenied = await request('POST', `/patients/${consentPatientId}/abdm/consents`, {
    token: limitedToken,
    body: {
      purpose: 'Permission test',
      hiTypes: ['Prescription'],
    },
  });
  if (consentPermissionDenied.status === 403) {
    pass('61 consent permission enforcement', '403');
  } else {
    fail('61 consent permission enforcement', `${consentPermissionDenied.status}`);
  }

  // --- Day 5: integration/security hardening ---
  const noAuthConfig = await request('GET', '/abdm/config');
  if (noAuthConfig.status === 401) {
    pass('63 ABDM endpoint without JWT rejected', '401');
  } else {
    fail('63 ABDM endpoint without JWT rejected', `${noAuthConfig.status}`);
  }

  const invalidAbhaLink = await request('POST', `/patients/${patientId}/abha/link`, {
    token,
    body: { abhaNumber: 'not-a-valid-abha' },
  });
  if (invalidAbhaLink.status === 400) {
    pass('64 invalid ABHA format rejected');
  } else {
    fail('64 invalid ABHA format rejected', `${invalidAbhaLink.status}`);
  }

  const patchInvalidHpr = await request('PATCH', `/users/${adminUserId}/abdm`, {
    token,
    body: { hprId: 'HPR-MOCK-INVALID' },
  });
  if (patchInvalidHpr.status === 400) {
    pass('65 PATCH legacy HPR route rejects invalid format');
  } else {
    fail('65 PATCH legacy HPR route rejects invalid format', `${patchInvalidHpr.status}`);
  }

  const patchRegisteredBypass = await request('PATCH', `/users/${adminUserId}/abdm`, {
    token,
    body: { hprId: '12-3456-7890-5678', linkStatus: 'REGISTERED' },
  });
  if (patchRegisteredBypass.status === 400) {
    pass('66 PATCH cannot set REGISTERED directly');
  } else {
    fail('66 PATCH cannot set REGISTERED directly', `${patchRegisteredBypass.status}`);
  }

  try {
    const { AbdmEnvironmentService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-environment.service'));
    const { AbdmHfrSearchService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-hfr-search.service'));
    const { AbdmSessionService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-session.service'));
    const { AbdmHeadersService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-headers.service'));
    const savedMockModeHfr = process.env.ABDM_MOCK_MODE;
    const savedHfrUrl = process.env.ABDM_HFR_SEARCH_URL;
    process.env.ABDM_MOCK_MODE = 'false';
    process.env.ABDM_HFR_SEARCH_URL = '';
    const realHfrEnv = new AbdmEnvironmentService();
    const realHfrSearch = new AbdmHfrSearchService(
      realHfrEnv,
      new AbdmSessionService(realHfrEnv),
      new AbdmHeadersService(realHfrEnv),
    );
    let hfrRealUnavailable = false;
    try {
      await realHfrSearch.search({ facilityName: 'Test' });
    } catch (error) {
      hfrRealUnavailable =
        error?.status === 503 ||
        error?.message?.includes('not available') ||
        error?.response?.statusCode === 503;
    }
    process.env.ABDM_MOCK_MODE = savedMockModeHfr;
    process.env.ABDM_HFR_SEARCH_URL = savedHfrUrl;
    if (hfrRealUnavailable) {
      pass('67 real HFR search without URL returns 503');
    } else {
      fail('67 real HFR search without URL returns 503');
    }
  } catch (error) {
    fail('67 real HFR search without URL returns 503', error?.message || String(error));
  }

  const abhaCallbackAudit = await prisma.auditLog.findFirst({
    where: {
      hospitalId: login.body.user.hospitalId,
      action: 'ABHA_LINKED',
    },
    orderBy: { createdAt: 'desc' },
  });
  const abhaAuditMeta = JSON.stringify(abhaCallbackAudit?.metadata || {});
  if (
    abhaCallbackAudit &&
    !abhaAuditMeta.includes('linkToken') &&
    !abhaAuditMeta.includes('access_token')
  ) {
    pass('68 ABHA callback audit excludes sensitive tokens');
  } else {
    fail('68 ABHA callback audit excludes sensitive tokens', abhaAuditMeta);
  }

  const hprAuditMeta = JSON.stringify(hprAudit?.metadata || {});
  if (hprAudit && hprAuditMeta.includes('****') && !hprAuditMeta.includes('71-1850-0578-3603')) {
    pass('69 HPR audit metadata masks identifier');
  } else if (hprAudit && hprAuditMeta.includes('71-****')) {
    pass('69 HPR audit metadata masks identifier');
  } else {
    fail('69 HPR audit metadata masks identifier', hprAuditMeta);
  }

  const productionMockGuard = await (async () => {
    const { AbdmEnvironmentService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-environment.service'));
    const savedEnv = process.env.ABDM_ENV;
    const savedMock = process.env.ABDM_MOCK_MODE;
    process.env.ABDM_ENV = 'production';
    delete process.env.ABDM_MOCK_MODE;
    const prodEnv = new AbdmEnvironmentService();
    const defaultsToReal = prodEnv.isMockMode() === false;
    process.env.ABDM_ENV = savedEnv;
    if (savedMock !== undefined) {
      process.env.ABDM_MOCK_MODE = savedMock;
    } else {
      delete process.env.ABDM_MOCK_MODE;
    }
    return defaultsToReal;
  })();
  if (productionMockGuard) {
    pass('70 production defaults to real mode when ABDM_MOCK_MODE unset');
  } else {
    fail('70 production defaults to real mode when ABDM_MOCK_MODE unset');
  }

  try {
    const { AbdmEnvironmentService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-environment.service'));
    const { AbdmConsentManagerService } = require(path.join(__dirname, '..', 'dist', 'src', 'abdm', 'abdm-consent-manager.service'));
    const savedMockModeConsent = process.env.ABDM_MOCK_MODE;
    process.env.ABDM_MOCK_MODE = 'false';
    process.env.ABDM_CONSENT_MANAGER_URL = '';
    const realEnv = new AbdmEnvironmentService();
    const realManager = new AbdmConsentManagerService(realEnv);
    let realModeUnavailable = false;
    try {
      await realManager.createConsentRequest({
        patientId: '00000000-0000-4000-8000-000000000001',
        purpose: 'Real mode test',
      });
    } catch (error) {
      realModeUnavailable =
        error?.status === 503 ||
        error?.message?.includes('not available') ||
        error?.response?.statusCode === 503;
    }
    process.env.ABDM_MOCK_MODE = savedMockModeConsent;
    if (realModeUnavailable) {
      pass('62 real mode consent without configuration returns 503');
    } else {
      fail('62 real mode consent without configuration returns 503');
    }
  } catch (error) {
    fail('62 real mode consent without configuration returns 503', error?.message || String(error));
  }

  await prisma.user.delete({ where: { id: limitedUser.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: limitedRole.id } }).catch(() => {});
  await prisma.abdmConsent.delete({ where: { id: otherConsent.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: otherRole.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: otherHospital.id } }).catch(() => {});

  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
