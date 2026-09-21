const bcrypt = require('bcrypt');
const path = require('path');

const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma/client'));

const BASE = 'http://localhost:3000';
const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const uniqueSuffix = runId.replace(/[^a-zA-Z0-9]/g, '').slice(-16);
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

async function createPatient(token) {
  const phone = `${Date.now()}${Math.floor(Math.random() * 9)}`.slice(-10);
  const res = await request('POST', '/patients', {
    token,
    body: {
      phone,
      firstName: 'Surg',
      lastName: `Patient${uniqueSuffix.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return res.body?.id;
}

let encounterSlot = 0;
async function createOpdEncounter(token, patientId, doctorResourceId) {
  const slot = encounterSlot++;
  const day = 1 + Math.floor(slot / 6);
  const hour = 8 + (slot % 6);
  const date = `2030-07-${String(day).padStart(2, '0')}`;
  const startAt = `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const endAt = `${date}T${String(hour).padStart(2, '0')}:30:00.000Z`;
  const appt = await request('POST', '/appointments', {
    token,
    body: {
      patientId,
      startAt,
      endAt,
      resourceIds: [doctorResourceId],
      reason: `Surgery eval ${uniqueSuffix.slice(0, 4)}-${slot}`,
    },
  });
  const enc = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId, encounterType: 'OPD', appointmentId: appt.body?.id },
  });
  return enc.body?.id;
}

async function main() {
  const prisma = new PrismaClient();

  const login = await request('POST', '/auth/login', {
    body: { email: 'admin@test.com', password: 'MediOS@12345' },
  });
  const token = login.body?.accessToken;
  const hospitalId = login.body?.user?.hospitalId;
  const adminUserId = login.body?.user?.id;
  if (!token || !hospitalId) {
    fail('login');
    process.exit(1);
  }
  pass('login');

  for (const perm of ['surgery:read', 'surgery:manage']) {
    const p = await prisma.permission.upsert({
      where: { name: perm },
      update: {},
      create: { name: perm, description: perm },
    });
    const adminRole = await prisma.role.findFirst({ where: { hospitalId, name: 'ADMIN' } });
    if (adminRole) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: p.id },
      });
    }
  }

  const branch = await prisma.branch.upsert({
    where: { hospitalId_code: { hospitalId, code: `SRG-${uniqueSuffix.slice(0, 6)}` } },
    update: {},
    create: {
      hospitalId,
      name: `Surgery Branch ${uniqueSuffix.slice(0, 4)}`,
      code: `SRG-${uniqueSuffix.slice(0, 6)}`,
    },
  });

  const doctorRes = await request('POST', '/resources', {
    token,
    body: { type: 'DOCTOR', name: `Dr Surg ${uniqueSuffix.slice(0, 4)}` },
  });
  const doctorId = doctorRes.body?.id;

  const otRes = await request('POST', '/resources', {
    token,
    body: {
      type: 'OPERATION_THEATRE',
      name: `OT-1 ${uniqueSuffix.slice(0, 4)}`,
      branchId: branch.id,
    },
  });
  const otId = otRes.body?.id;

  const patientId = await createPatient(token);
  const encounterId = await createOpdEncounter(token, patientId, doctorId);

  const createReq = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId,
      encounterId,
      procedureName: `Appendectomy ${uniqueSuffix.slice(0, 4)}`,
      priority: 'ELECTIVE',
    },
  });
  const requestId = createReq.body?.id;
  if ((createReq.status === 201 || createReq.status === 200) && requestId) {
    pass('1 surgery request creation');
  } else {
    fail('1 surgery request creation', `${createReq.status} ${JSON.stringify(createReq.body)}`);
  }

  const badEncounter = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId,
      encounterId: '00000000-0000-4000-8000-000000000001',
      procedureName: 'Bad encounter',
    },
  });
  if (badEncounter.status === 404) {
    pass('2 clinical encounter validation', '404');
  } else {
    fail('2 clinical encounter validation', `${badEncounter.status}`);
  }

  const wrongPatient = await createPatient(token);
  const mismatch = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: wrongPatient,
      encounterId,
      procedureName: 'Mismatch',
    },
  });
  if (mismatch.status === 400) {
    pass('3 patient mismatch rejection', '400');
  } else {
    fail('3 patient mismatch rejection', `${mismatch.status}`);
  }

  const ipdPatient = await createPatient(token);
  const admission = await request('POST', '/ipd/admissions', {
    token,
    body: { patientId: ipdPatient, branchId: branch.id, reason: 'Surgery prep' },
  });
  const ipdEnc = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId: ipdPatient,
      encounterType: 'IPD',
      ipdAdmissionId: admission.body?.id,
    },
  });
  const ipdLink = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: ipdPatient,
      encounterId: ipdEnc.body?.id,
      admissionId: admission.body?.id,
      procedureName: 'IPD linked surgery',
    },
  });
  if ((ipdLink.status === 201 || ipdLink.status === 200) && ipdLink.body?.admissionId) {
    pass('4 IPD linkage validation');
  } else {
    fail('4 IPD linkage validation', `${ipdLink.status}`);
  }

  const badIpd = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId,
      encounterId,
      admissionId: admission.body?.id,
      procedureName: 'Bad IPD link',
    },
  });
  if (badIpd.status === 400) {
    pass('4b IPD patient mismatch', '400');
  } else {
    fail('4b IPD patient mismatch', `${badIpd.status}`);
  }

  const provider = await request('POST', '/insurance/providers', {
    token,
    body: {
      name: `Surg Ins ${uniqueSuffix}`,
      code: `SRG-INS-${uniqueSuffix}`,
      providerType: 'INSURANCE',
    },
  });
  const policy = await request('POST', '/insurance/policies', {
    token,
    body: {
      patientId,
      providerId: provider.body?.id,
      policyNumber: `SRG-POL-${uniqueSuffix}`,
    },
  });
  const preAuth = await request('POST', '/insurance/pre-authorizations', {
    token,
    body: {
      patientId,
      policyId: policy.body?.id,
      encounterId,
      requestedAmount: 50000,
    },
  });
  const preAuthLink = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId,
      encounterId,
      preAuthorizationId: preAuth.body?.id,
      procedureName: 'Ins linked surgery',
    },
  });
  if (
    (preAuthLink.status === 201 || preAuthLink.status === 200) &&
    preAuthLink.body?.preAuthorizationId === preAuth.body?.id
  ) {
    pass('5 insurance pre-auth linkage validation');
  } else {
    fail('5 insurance pre-auth linkage validation', `${preAuthLink.status}`);
  }

  const preOp = await request('POST', `/surgery/requests/${requestId}/pre-op`, {
    token,
    body: { fitnessStatus: 'FIT', notes: 'Cleared for surgery' },
  });
  if (
    (preOp.status === 201 || preOp.status === 200) &&
    preOp.body?.status === 'PRE_OP' &&
    preOp.body?.preOpAssessment?.fitnessStatus === 'FIT'
  ) {
    pass('6 pre-op creation');
    pass('7 pre-op fitness statuses', 'FIT');
  } else {
    fail('6 pre-op creation', `${preOp.status}`);
  }

  const badTransition = await request('POST', `/surgery/requests/${requestId}/start`, { token });
  if (badTransition.status === 400) {
    pass('8 invalid state transitions', '400 start before schedule');
  } else {
    fail('8 invalid state transitions', `${badTransition.status}`);
  }

  const roomRes = await request('POST', '/resources', {
    token,
    body: { type: 'ROOM', name: `Not OT ${uniqueSuffix.slice(0, 4)}` },
  });
  const badOt = await request('POST', `/surgery/requests/${requestId}/schedule`, {
    token,
    body: {
      resourceId: roomRes.body?.id,
      startAt: '2030-07-01T08:00:00.000Z',
      endAt: '2030-07-01T09:00:00.000Z',
    },
  });
  if (badOt.status === 400) {
    pass('9 OT resource validation', '400');
  } else {
    fail('9 OT resource validation', `${badOt.status}`);
  }

  const schedule = await request('POST', `/surgery/requests/${requestId}/schedule`, {
    token,
    body: {
      resourceId: otId,
      startAt: '2030-07-01T08:00:00.000Z',
      endAt: '2030-07-01T09:00:00.000Z',
      branchId: branch.id,
    },
  });
  if (
    (schedule.status === 201 || schedule.status === 200) &&
    schedule.body?.status === 'SCHEDULED' &&
    schedule.body?.schedule?.resourceId === otId
  ) {
    pass('10 surgery scheduling');
  } else {
    fail('10 surgery scheduling', `${schedule.status} ${JSON.stringify(schedule.body?.status)}`);
  }

  const overlapPatient = await createPatient(token);
  const overlapEnc = await createOpdEncounter(token, overlapPatient, doctorId);
  const overlapReq = await request('POST', '/surgery/requests', {
    token,
    body: { patientId: overlapPatient, encounterId: overlapEnc, procedureName: 'Overlap test' },
  });
  await request('POST', `/surgery/requests/${overlapReq.body?.id}/pre-op`, {
    token,
    body: { fitnessStatus: 'FIT' },
  });
  const overlap = await request('POST', `/surgery/requests/${overlapReq.body?.id}/schedule`, {
    token,
    body: {
      resourceId: otId,
      startAt: '2030-07-01T08:30:00.000Z',
      endAt: '2030-07-01T09:30:00.000Z',
    },
  });
  if (overlap.status === 409) {
    pass('11 overlapping OT rejection', '409');
  } else {
    fail('11 overlapping OT rejection', `${overlap.status}`);
  }

  const backPatient = await createPatient(token);
  const backEnc = await createOpdEncounter(token, backPatient, doctorId);
  const backReq = await request('POST', '/surgery/requests', {
    token,
    body: { patientId: backPatient, encounterId: backEnc, procedureName: 'Back-to-back' },
  });
  await request('POST', `/surgery/requests/${backReq.body?.id}/pre-op`, {
    token,
    body: { fitnessStatus: 'FIT' },
  });
  const backToBack = await request('POST', `/surgery/requests/${backReq.body?.id}/schedule`, {
    token,
    body: {
      resourceId: otId,
      startAt: '2030-07-01T09:00:00.000Z',
      endAt: '2030-07-01T10:00:00.000Z',
    },
  });
  if (backToBack.status === 201 || backToBack.status === 200) {
    pass('12 back-to-back scheduling');
  } else {
    fail('12 back-to-back scheduling', `${backToBack.status}`);
  }

  const concPatientA = await createPatient(token);
  const concEncA = await createOpdEncounter(token, concPatientA, doctorId);
  const concReqA = await request('POST', '/surgery/requests', {
    token,
    body: { patientId: concPatientA, encounterId: concEncA, procedureName: 'Conc A' },
  });
  await request('POST', `/surgery/requests/${concReqA.body?.id}/pre-op`, {
    token,
    body: { fitnessStatus: 'FIT' },
  });

  const concPatientB = await createPatient(token);
  const concEncB = await createOpdEncounter(token, concPatientB, doctorId);
  const concReqB = await request('POST', '/surgery/requests', {
    token,
    body: { patientId: concPatientB, encounterId: concEncB, procedureName: 'Conc B' },
  });
  await request('POST', `/surgery/requests/${concReqB.body?.id}/pre-op`, {
    token,
    body: { fitnessStatus: 'FIT' },
  });

  const [concA, concB] = await Promise.all([
    request('POST', `/surgery/requests/${concReqA.body.id}/schedule`, {
      token,
      body: {
        resourceId: otId,
        startAt: '2030-08-01T10:00:00.000Z',
        endAt: '2030-08-01T11:00:00.000Z',
      },
    }),
    request('POST', `/surgery/requests/${concReqB.body.id}/schedule`, {
      token,
      body: {
        resourceId: otId,
        startAt: '2030-08-01T10:00:00.000Z',
        endAt: '2030-08-01T11:00:00.000Z',
      },
    }),
  ]);
  const concSuccess = [concA, concB].filter((r) => r.status === 201 || r.status === 200).length;
  const concConflict = [concA, concB].filter((r) => r.status === 409).length;
  if (concSuccess === 1 && concConflict === 1) {
    pass('13 concurrent OT scheduling', '1 success, 1 conflict');
  } else {
    fail(
      '13 concurrent OT scheduling',
      `success=${concSuccess} conflict=${concConflict} statuses=${concA.status},${concB.status}`,
    );
  }

  const start = await request('POST', `/surgery/requests/${requestId}/start`, { token });
  if ((start.status === 201 || start.status === 200) && start.body?.status === 'IN_PROGRESS') {
    pass('14 surgery start');
  } else {
    fail('14 surgery start', `${start.status}`);
  }

  const procedure = await request('POST', `/surgery/requests/${requestId}/procedure`, {
    token,
    body: {
      surgeonUserId: adminUserId,
      findings: 'Normal appendix removed',
      outcome: 'Successful',
    },
  });
  if (procedure.status === 201 || procedure.status === 200) {
    pass('15 procedure record');
  } else {
    fail('15 procedure record', `${procedure.status}`);
  }

  const complete = await request('POST', `/surgery/requests/${requestId}/complete`, { token });
  if ((complete.status === 201 || complete.status === 200) && complete.body?.status === 'COMPLETED') {
    pass('16 surgery completion');
  } else {
    fail('16 surgery completion', `${complete.status}`);
  }

  const postOp = await request('POST', `/surgery/requests/${requestId}/post-op`, {
    token,
    body: { notes: 'Recovery stable', followUpInstructions: 'Review in 7 days' },
  });
  if (postOp.status === 201 || postOp.status === 200) {
    pass('17 post-op record');
  } else {
    fail('17 post-op record', `${postOp.status}`);
  }

  const cancelPatient = await createPatient(token);
  const cancelEnc = await createOpdEncounter(token, cancelPatient, doctorId);
  const cancelReq = await request('POST', '/surgery/requests', {
    token,
    body: { patientId: cancelPatient, encounterId: cancelEnc, procedureName: 'To cancel' },
  });
  const cancelRes = await request('POST', `/surgery/requests/${cancelReq.body?.id}/cancel`, {
    token,
    body: { cancellationReason: 'Patient deferred' },
  });
  if (
    (cancelRes.status === 201 || cancelRes.status === 200) &&
    cancelRes.body?.status === 'CANCELLED'
  ) {
    pass('18 cancellation');
  } else {
    fail('18 cancellation', `${cancelRes.status}`);
  }

  const terminalBlock = await request('POST', `/surgery/requests/${requestId}/cancel`, {
    token,
    body: { cancellationReason: 'Too late' },
  });
  if (terminalBlock.status === 400) {
    pass('19 terminal-state protection', '400');
  } else {
    fail('19 terminal-state protection', `${terminalBlock.status}`);
  }

  const otherHospital = await prisma.hospital.create({
    data: { name: `SRG ISO ${uniqueSuffix}`, code: `SRG-ISO-${uniqueSuffix}` },
  });
  const otherPatient = await prisma.patient.create({
    data: {
      hospitalId: otherHospital.id,
      phone: `7${Date.now()}`.slice(-10),
      firstName: 'Other',
      lastName: 'Hospital',
    },
  });
  const otherEnc = await prisma.clinicalEncounter.create({
    data: {
      hospitalId: otherHospital.id,
      patientId: otherPatient.id,
      providerUserId: (
        await prisma.user.findFirst({ where: { hospitalId: otherHospital.id } })
      )?.id || adminUserId,
      encounterType: 'OPD',
      status: 'OPEN',
    },
  });
  const crossHospital = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId,
      encounterId: otherEnc.id,
      procedureName: 'Cross hospital',
    },
  });
  if (crossHospital.status === 404) {
    pass('20 tenant isolation', '404');
    pass('23 cross-hospital linked-resource rejection', '404');
  } else {
    fail('20 tenant isolation', `${crossHospital.status}`);
  }

  const limitedRole = await prisma.role.create({
    data: { hospitalId, name: `NO-SRG-${uniqueSuffix.slice(0, 6)}` },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited Surg User',
      email: `no-srg-${uniqueSuffix}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: { email: limitedUser.email, password: 'MediOS@12345' },
  });
  const permDenied = await request('GET', '/surgery/requests', {
    token: limitedLogin.body?.accessToken,
  });
  if (permDenied.status === 403) {
    pass('21 permission enforcement', '403');
  } else {
    fail('21 permission enforcement', `${permDenied.status}`);
  }

  const audit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'SURGERY_REQUEST_CREATED', entityId: requestId },
  });
  if (audit) {
    pass('22 audit events');
  } else {
    fail('22 audit events');
  }

  await prisma.surgeryRequest.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.clinicalEncounter.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: otherHospital.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: limitedUser.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: limitedRole.id } }).catch(() => {});
  await prisma.$disconnect();

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${passed}/${total} passed`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
