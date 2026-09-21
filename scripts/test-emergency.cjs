const bcrypt = require('bcrypt');
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

async function createPatient(token) {
  const phone = `${Date.now()}${Math.floor(Math.random() * 9)}`.slice(-10);
  const res = await request('POST', '/patients', {
    token,
    body: {
      phone,
      firstName: 'Emerg',
      lastName: `Patient${runId.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return res.body?.id;
}

async function createVisit(token, patientId, branchId, priority = 'URGENT') {
  return request('POST', '/emergency/visits', {
    token,
    body: {
      patientId,
      branchId,
      chiefComplaint: 'Chest pain',
      notes: 'Walk-in',
      priority,
    },
  });
}

async function triageVisit(token, visitId, overrides = {}) {
  return request('POST', `/emergency/visits/${visitId}/triage`, {
    token,
    body: {
      priority: 'EMERGENCY',
      temperature: 37.2,
      heartRate: 88,
      respiratoryRate: 18,
      systolicBp: 120,
      diastolicBp: 80,
      oxygenSaturation: 98,
      painScore: 6,
      consciousness: 'Alert',
      notes: 'Initial assessment',
      ...overrides,
    },
  });
}

async function main() {
  const prisma = new PrismaClient();

  const login = await request('POST', '/auth/login', {
    body: { email: 'admin@test.com', password: 'MediOS@12345' },
  });
  const token = login.body?.accessToken;
  const hospitalId = login.body?.user?.hospitalId;
  if (!token || !hospitalId) {
    fail('login');
    process.exit(1);
  }
  pass('login');

  await prisma.permission.upsert({
    where: { name: 'emergency:read' },
    update: {},
    create: { name: 'emergency:read', description: 'View emergency' },
  });
  const emRead = await prisma.permission.findUnique({ where: { name: 'emergency:read' } });
  const emManage = await prisma.permission.upsert({
    where: { name: 'emergency:manage' },
    update: {},
    create: { name: 'emergency:manage', description: 'Manage emergency' },
  });
  const adminRole = await prisma.role.findFirst({ where: { hospitalId, name: 'ADMIN' } });
  if (adminRole) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: emRead.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: emRead.id },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: emManage.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: emManage.id },
    });
  }

  const branch = await prisma.branch.upsert({
    where: { hospitalId_code: { hospitalId, code: `EMG-${runId.slice(0, 4)}` } },
    update: {},
    create: {
      hospitalId,
      name: `Emergency Branch ${runId.slice(0, 4)}`,
      code: `EMG-${runId.slice(0, 4)}`,
    },
  });

  const patientId = await createPatient(token);
  const createRes = await createVisit(token, patientId, branch.id, 'URGENT');
  const visitId = createRes.body?.id;
  const encounterId = createRes.body?.encounterId;

  if (
    (createRes.status === 201 || createRes.status === 200) &&
    visitId &&
    createRes.body?.status === 'ARRIVED' &&
    createRes.body?.encounter?.encounterType === 'EMERGENCY'
  ) {
    pass('1 create emergency visit');
  } else {
    fail('1 create emergency visit', `${createRes.status} ${JSON.stringify(createRes.body)}`);
  }

  const getRes = await request('GET', `/emergency/visits/${visitId}`, { token });
  const listRes = await request('GET', '/emergency/visits', { token });
  if (getRes.status === 200 && listRes.status === 200 && listRes.body.some((v) => v.id === visitId)) {
    pass('2 get/list emergency visits');
  } else {
    fail('2 get/list emergency visits', `${getRes.status}/${listRes.status}`);
  }

  const filterStatus = await request('GET', '/emergency/visits?status=ARRIVED', { token });
  if (filterStatus.status === 200 && filterStatus.body.some((v) => v.id === visitId)) {
    pass('3 filter by status');
  } else {
    fail('3 filter by status', `${filterStatus.status}`);
  }

  const filterPriority = await request('GET', '/emergency/visits?priority=URGENT', { token });
  if (filterPriority.status === 200 && filterPriority.body.some((v) => v.id === visitId)) {
    pass('4 filter by priority');
  } else {
    fail('4 filter by priority', `${filterPriority.status}`);
  }

  const triageRes = await triageVisit(token, visitId);
  if (
    triageRes.status === 201 ||
    (triageRes.status === 200 && triageRes.body?.visit?.status === 'TRIAGED')
  ) {
    pass('5 create triage');
  } else {
    fail('5 create triage', `${triageRes.status} ${JSON.stringify(triageRes.body)}`);
  }

  const triageUpdate = await triageVisit(token, visitId, {
    priority: 'NORMAL',
    heartRate: 92,
    notes: 'Reassessment',
  });
  if (triageUpdate.status === 200 || triageUpdate.status === 201) {
    pass('6 update triage (new record)');
  } else {
    fail('6 update triage', `${triageUpdate.status}`);
  }

  const historyRes = await request('GET', `/emergency/visits/${visitId}/triage`, { token });
  if (historyRes.status === 200 && historyRes.body?.records?.length >= 2) {
    pass('7 triage history preserved', `${historyRes.body.records.length} records`);
  } else {
    fail('7 triage history', `${historyRes.status} count=${historyRes.body?.records?.length}`);
  }

  const startRes = await request('POST', `/emergency/visits/${visitId}/start-treatment`, { token });
  if (startRes.status === 201 || (startRes.status === 200 && startRes.body?.status === 'IN_TREATMENT')) {
    pass('8 start treatment');
  } else {
    fail('8 start treatment', `${startRes.status} ${JSON.stringify(startRes.body)}`);
  }

  const patient2 = await createPatient(token);
  const visit2Res = await createVisit(token, patient2, branch.id);
  const visit2Id = visit2Res.body?.id;
  await triageVisit(token, visit2Id);
  const escalateRes = await request('POST', `/emergency/visits/${visit2Id}/escalate`, {
    token,
    body: { reason: 'Requires senior review' },
  });
  if (escalateRes.status === 201 || (escalateRes.status === 200 && escalateRes.body?.triage?.escalatedAt)) {
    pass('9 escalate');
  } else {
    fail('9 escalate', `${escalateRes.status} ${JSON.stringify(escalateRes.body)}`);
  }

  async function dispositionFlow(patientSuffix, disposition) {
    const p = await createPatient(token);
    const v = await createVisit(token, p, branch.id);
    await triageVisit(token, v.body.id);
    await request('POST', `/emergency/visits/${v.body.id}/start-treatment`, { token });
    return request('POST', `/emergency/visits/${v.body.id}/disposition`, {
      token,
      body: { disposition },
    });
  }

  const discharged = await dispositionFlow('d', 'DISCHARGED');
  if (discharged.status === 201 || (discharged.status === 200 && discharged.body?.status === 'DISCHARGED')) {
    pass('10 set discharged disposition');
  } else {
    fail('10 set discharged disposition', `${discharged.status}`);
  }

  const admitted = await dispositionFlow('a', 'ADMITTED');
  if (admitted.status === 201 || (admitted.status === 200 && admitted.body?.status === 'ADMITTED')) {
    pass('11 set admitted disposition');
  } else {
    fail('11 set admitted disposition', `${admitted.status}`);
  }

  const ipdCountBefore = await prisma.ipdAdmission.count({ where: { hospitalId, patientId: admitted.body?.patientId } });
  if (ipdCountBefore === 0) {
    pass('11b admitted disposition does not auto-create IPD');
  } else {
    fail('11b admitted disposition does not auto-create IPD', `count=${ipdCountBefore}`);
  }

  const transferred = await dispositionFlow('t', 'TRANSFERRED');
  if (transferred.status === 201 || (transferred.status === 200 && transferred.body?.status === 'TRANSFERRED')) {
    pass('12 set transferred disposition');
  } else {
    fail('12 set transferred disposition', `${transferred.status}`);
  }

  const lwbs = await dispositionFlow('l', 'LEFT_WITHOUT_BEING_SEEN');
  if (
    lwbs.status === 201 ||
    (lwbs.status === 200 && lwbs.body?.status === 'LEFT_WITHOUT_BEING_SEEN')
  ) {
    pass('13 left without being seen');
  } else {
    fail('13 left without being seen', `${lwbs.status}`);
  }

  const cancelPatient = await createPatient(token);
  const cancelVisit = await createVisit(token, cancelPatient, branch.id);
  const cancelRes = await request('POST', `/emergency/visits/${cancelVisit.body.id}/cancel`, { token });
  if (cancelRes.status === 201 || (cancelRes.status === 200 && cancelRes.body?.status === 'CANCELLED')) {
    pass('14 cancel valid visit');
  } else {
    fail('14 cancel valid visit', `${cancelRes.status}`);
  }

  const invalidTransition = await request('POST', `/emergency/visits/${visitId}/start-treatment`, { token });
  if (invalidTransition.status === 400) {
    pass('15 reject invalid state transition', '400');
  } else {
    fail('15 reject invalid state transition', `${invalidTransition.status}`);
  }

  const otherHospital = await prisma.hospital.create({
    data: { name: `EMG ISO ${runId.slice(0, 6)}`, code: `EMG-ISO-${runId.slice(0, 6)}` },
  });
  const otherBranch = await prisma.branch.create({
    data: { hospitalId: otherHospital.id, name: 'Other ER', code: `OER-${runId.slice(0, 4)}` },
  });
  const otherPatient = await prisma.patient.create({
    data: {
      hospitalId: otherHospital.id,
      phone: `8${Date.now()}`.slice(-10),
      firstName: 'Other',
      lastName: 'ER',
    },
  });
  const otherRole = await prisma.role.create({
    data: { hospitalId: otherHospital.id, name: `R-${runId.slice(0, 4)}` },
  });
  const otherUser = await prisma.user.create({
    data: {
      hospitalId: otherHospital.id,
      roleId: otherRole.id,
      name: 'Other ER User',
      email: `other-emg-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const otherEncounter = await prisma.clinicalEncounter.create({
    data: {
      hospitalId: otherHospital.id,
      branchId: otherBranch.id,
      patientId: otherPatient.id,
      providerUserId: otherUser.id,
      encounterType: 'EMERGENCY',
    },
  });
  const otherVisit = await prisma.emergencyVisit.create({
    data: {
      hospitalId: otherHospital.id,
      branchId: otherBranch.id,
      patientId: otherPatient.id,
      encounterId: otherEncounter.id,
      chiefComplaint: 'Secret',
      priority: 'NORMAL',
    },
  });
  const otherTriage = await prisma.triageRecord.create({
    data: {
      hospitalId: otherHospital.id,
      emergencyVisitId: otherVisit.id,
      assessedByUserId: otherUser.id,
      priority: 'NORMAL',
    },
  });

  const crossVisit = await request('GET', `/emergency/visits/${otherVisit.id}`, { token });
  if (crossVisit.status === 404) {
    pass('16 cross-hospital emergency access blocked', '404');
  } else {
    fail('16 cross-hospital emergency access blocked', `${crossVisit.status}`);
  }

  const crossTriage = await request('GET', `/emergency/visits/${otherVisit.id}/triage`, { token });
  if (crossTriage.status === 404) {
    pass('17 cross-hospital triage access blocked', '404');
  } else {
    fail('17 cross-hospital triage access blocked', `${crossTriage.status}`);
  }

  const noJwt = await request('GET', '/emergency/visits');
  if (noJwt.status === 401) {
    pass('18 missing JWT rejected', '401');
  } else {
    fail('18 missing JWT rejected', `${noJwt.status}`);
  }

  const limitedRole = await prisma.role.create({
    data: { hospitalId, name: `NO-EMG-${runId.slice(0, 4)}` },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited ER User',
      email: `no-emg-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: { email: limitedUser.email, password: 'MediOS@12345' },
  });
  const permissionDenied = await request('GET', '/emergency/visits', {
    token: limitedLogin.body?.accessToken,
  });
  if (permissionDenied.status === 403) {
    pass('19 missing permission rejected', '403');
  } else {
    fail('19 missing permission rejected', `${permissionDenied.status}`);
  }

  const visitAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'EMERGENCY_VISIT_CREATED', entityId: visitId },
  });
  const triageAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'EMERGENCY_TRIAGE_CREATED' },
  });
  const triageMeta = JSON.stringify(triageAudit?.metadata || {});
  if (visitAudit && triageAudit && !triageMeta.includes('Initial assessment')) {
    pass('20 audit events without full triage notes');
  } else {
    fail('20 audit events', `visit=${!!visitAudit} triage=${!!triageAudit}`);
  }

  const otherHospitalPatient = await prisma.patient.create({
    data: {
      hospitalId,
      phone: `9${Date.now()}`.slice(-10),
      firstName: 'Wrong',
      lastName: 'Tenant',
    },
  });
  await prisma.patient.update({
    where: { id: otherHospitalPatient.id },
    data: { mergedIntoPatientId: patientId },
  });
  const mergedPatientVisit = await createVisit(token, otherHospitalPatient.id, branch.id);
  if (mergedPatientVisit.status === 400 || mergedPatientVisit.status === 404) {
    pass('21 patient must belong to tenant/active', `${mergedPatientVisit.status}`);
  } else {
    fail('21 patient must belong to tenant/active', `${mergedPatientVisit.status}`);
  }

  const vitalsPriorityRes = await triageVisit(token, visit2Id, {
    priority: 'NORMAL',
    heartRate: 200,
    oxygenSaturation: 70,
  });
  if (
    (vitalsPriorityRes.status === 200 || vitalsPriorityRes.status === 201) &&
    vitalsPriorityRes.body?.triage?.priority === 'NORMAL'
  ) {
    pass('22 no automatic priority from vitals');
  } else {
    fail('22 no automatic priority from vitals', `${vitalsPriorityRes.status}`);
  }

  const noRecommendation = createRes.body?.treatmentRecommendation === undefined &&
    triageRes.body?.recommendation === undefined;
  if (noRecommendation) {
    pass('23 no automatic treatment recommendation');
  } else {
    fail('23 no automatic treatment recommendation');
  }

  const invalidVitals = await triageVisit(token, visit2Id, { painScore: 15 });
  if (invalidVitals.status === 400) {
    pass('24 triage numeric validation', '400');
  } else {
    fail('24 triage numeric validation', `${invalidVitals.status}`);
  }

  const noReasonEscalate = await request('POST', `/emergency/visits/${visit2Id}/escalate`, {
    token,
    body: { reason: '' },
  });
  if (noReasonEscalate.status === 400) {
    pass('25 required escalation reason', '400');
  } else {
    fail('25 required escalation reason', `${noReasonEscalate.status}`);
  }

  const disposedVisitId = discharged.body?.id;
  const modifyDisposed = await request('POST', `/emergency/visits/${disposedVisitId}/disposition`, {
    token,
    body: { disposition: 'ADMITTED' },
  });
  const modifyDisposedTriage = await request('POST', `/emergency/visits/${disposedVisitId}/triage`, {
    token,
    body: { priority: 'NORMAL' },
  });
  if (modifyDisposed.status === 400 && modifyDisposedTriage.status === 400) {
    pass('26 completed/disposed visit cannot be modified', '400');
  } else {
    fail(
      '26 completed/disposed visit cannot be modified',
      `disposition=${modifyDisposed.status} triage=${modifyDisposedTriage.status}`,
    );
  }

  if (createRes.body?.branchId === branch.id && encounterId) {
    pass('branch handling', `branchId=${createRes.body.branchId}`);
  }

  await prisma.triageRecord.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.emergencyVisit.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.clinicalEncounter.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.role.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: otherHospital.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: limitedUser.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: limitedRole.id } }).catch(() => {});
  void otherTriage;

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
