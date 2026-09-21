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
      firstName: 'Ipd',
      lastName: `Patient${runId.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return res.body?.id;
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

  const branchSuffix = runId.replace(/[^a-zA-Z0-9]/g, '').slice(-8);

  const branch = await prisma.branch.create({
    data: {
      hospitalId,
      name: `IPD Branch ${branchSuffix}`,
      code: `IPD-${branchSuffix}`,
    },
  });

  const createBed = await request('POST', '/ipd/beds', {
    token,
    body: {
      branchId: branch.id,
      wardName: `General-${branchSuffix}`,
      roomNumber: '101',
      bedNumber: '1',
      bedType: 'GENERAL',
    },
  });
  const bedId = createBed.body?.id;
  if (
    (createBed.status === 201 || createBed.status === 200) &&
    bedId &&
    createBed.body?.status === 'AVAILABLE'
  ) {
    pass('1 create bed');
  } else {
    fail('1 create bed', `${createBed.status} ${JSON.stringify(createBed.body)}`);
  }

  const bed2Res = await request('POST', '/ipd/beds', {
    token,
    body: {
      branchId: branch.id,
      wardName: `General-${branchSuffix}`,
      roomNumber: '101',
      bedNumber: '2',
      bedType: 'PRIVATE',
    },
  });
  const bed2Id = bed2Res.body?.id;

  const bed3Res = await request('POST', '/ipd/beds', {
    token,
    body: {
      branchId: branch.id,
      wardName: `General-${branchSuffix}`,
      roomNumber: '102',
      bedNumber: '1',
      bedType: 'GENERAL',
    },
  });
  const bed3Id = bed3Res.body?.id;

  const listBeds = await request('GET', '/ipd/beds', { token });
  if (listBeds.status === 200 && Array.isArray(listBeds.body) && listBeds.body.length >= 1) {
    pass('2 list beds', `${listBeds.body.length} beds`);
  } else {
    fail('2 list beds', `${listBeds.status}`);
  }

  const getBed = await request('GET', `/ipd/beds/${bedId}`, { token });
  if (getBed.status === 200 && getBed.body?.id === bedId) {
    pass('3 get bed');
  } else {
    fail('3 get bed', `${getBed.status}`);
  }

  const updateBed = await request('PATCH', `/ipd/beds/${bedId}`, {
    token,
    body: { notes: 'Near window' },
  });
  if (updateBed.status === 200 && updateBed.body?.notes === 'Near window') {
    pass('4 update bed');
  } else {
    fail('4 update bed', `${updateBed.status}`);
  }

  const availableBeds = await request('GET', '/ipd/beds?status=AVAILABLE&branchId=' + branch.id, {
    token,
  });
  if (
    availableBeds.status === 200 &&
    availableBeds.body.every((b) => b.status === 'AVAILABLE')
  ) {
    pass('5 filter available beds');
  } else {
    fail('5 filter available beds', `${availableBeds.status}`);
  }

  const patientId = await createPatient(token);
  if (!patientId) {
    fail('setup patient');
    process.exit(1);
  }

  const createAdmission = await request('POST', '/ipd/admissions', {
    token,
    body: {
      patientId,
      branchId: branch.id,
      reason: 'Observation',
      bedId,
    },
  });
  const admissionId = createAdmission.body?.id;
  if (
    (createAdmission.status === 201 || createAdmission.status === 200) &&
    admissionId &&
    createAdmission.body?.status === 'ADMITTED'
  ) {
    pass('6 create admission with bed');
  } else {
    fail('6 create admission with bed', `${createAdmission.status} ${JSON.stringify(createAdmission.body)}`);
  }

  if (createAdmission.body?.admissionNumber?.startsWith('ADM-')) {
    pass('7 admission number generated', createAdmission.body.admissionNumber);
  } else {
    fail('7 admission number generated', JSON.stringify(createAdmission.body?.admissionNumber));
  }

  const occupiedBed = await request('GET', `/ipd/beds/${bedId}`, { token });
  if (occupiedBed.body?.status === 'OCCUPIED') {
    pass('8 bed becomes OCCUPIED');
  } else {
    fail('8 bed becomes OCCUPIED', JSON.stringify(occupiedBed.body));
  }

  const patient2Id = await createPatient(token);
  const dupAdmission = await request('POST', '/ipd/admissions', {
    token,
    body: {
      patientId,
      branchId: branch.id,
      reason: 'Duplicate',
    },
  });
  if (dupAdmission.status === 409) {
    pass('9 duplicate active admission blocked', '409');
  } else {
    fail('9 duplicate active admission blocked', `${dupAdmission.status}`);
  }

  const transfer = await request('POST', `/ipd/admissions/${admissionId}/transfer`, {
    token,
    body: { newBedId: bed2Id, reason: 'Private room upgrade' },
  });
  if (
    transfer.status === 201 ||
    (transfer.status === 200 && transfer.body?.currentBed?.id === bed2Id)
  ) {
    pass('10 transfer to available bed');
  } else {
    fail('10 transfer to available bed', `${transfer.status} ${JSON.stringify(transfer.body)}`);
  }

  const oldBedAfterTransfer = await request('GET', `/ipd/beds/${bedId}`, { token });
  if (oldBedAfterTransfer.body?.status === 'AVAILABLE') {
    pass('11 old bed becomes AVAILABLE');
  } else {
    fail('11 old bed becomes AVAILABLE', JSON.stringify(oldBedAfterTransfer.body));
  }

  const newBedAfterTransfer = await request('GET', `/ipd/beds/${bed2Id}`, { token });
  if (newBedAfterTransfer.body?.status === 'OCCUPIED') {
    pass('12 new bed becomes OCCUPIED');
  } else {
    fail('12 new bed becomes OCCUPIED', JSON.stringify(newBedAfterTransfer.body));
  }

  const admissionHistory = await request('GET', `/ipd/admissions/${admissionId}`, { token });
  if (
    admissionHistory.status === 200 &&
    Array.isArray(admissionHistory.body?.bedHistory) &&
    admissionHistory.body.bedHistory.length >= 2
  ) {
    pass('13 transfer history recorded', `${admissionHistory.body.bedHistory.length} assignments`);
  } else {
    fail('13 transfer history recorded', JSON.stringify(admissionHistory.body?.bedHistory));
  }

  const transferToOccupied = await request('POST', `/ipd/admissions/${admissionId}/transfer`, {
    token,
    body: { newBedId: bed2Id },
  });
  if (transferToOccupied.status === 400 || transferToOccupied.status === 409) {
    pass('14 transfer to occupied/same bed blocked', `${transferToOccupied.status}`);
  } else {
    fail('14 transfer to occupied/same bed blocked', `${transferToOccupied.status}`);
  }

  const discharge = await request('POST', `/ipd/admissions/${admissionId}/discharge`, { token });
  if (
    discharge.status === 201 ||
    (discharge.status === 200 && discharge.body?.status === 'DISCHARGED')
  ) {
    pass('15 discharge admission');
  } else {
    fail('15 discharge admission', `${discharge.status} ${JSON.stringify(discharge.body)}`);
  }

  const bedAfterDischarge = await request('GET', `/ipd/beds/${bed2Id}`, { token });
  if (bedAfterDischarge.body?.status === 'AVAILABLE') {
    pass('16 bed becomes AVAILABLE after discharge');
  } else {
    fail('16 bed becomes AVAILABLE after discharge', JSON.stringify(bedAfterDischarge.body));
  }

  const reDischarge = await request('POST', `/ipd/admissions/${admissionId}/discharge`, { token });
  if (reDischarge.status === 400) {
    pass('17 discharged admission cannot be re-discharged', '400');
  } else {
    fail('17 discharged admission cannot be re-discharged', `${reDischarge.status}`);
  }

  const isoSuffix = runId.replace(/[^a-zA-Z0-9]/g, '').slice(-10);

  const otherHospital = await prisma.hospital.create({
    data: {
      name: `IPD ISO ${isoSuffix}`,
      code: `IPD-ISO-${isoSuffix}`,
    },
  });
  const otherBranch = await prisma.branch.create({
    data: {
      hospitalId: otherHospital.id,
      name: 'Other Branch',
      code: 'OTH',
    },
  });
  const otherBed = await prisma.ipdBed.create({
    data: {
      hospitalId: otherHospital.id,
      branchId: otherBranch.id,
      wardName: 'ISO',
      roomNumber: '1',
      bedNumber: '1',
    },
  });
  const otherPatient = await prisma.patient.create({
    data: {
      hospitalId: otherHospital.id,
      phone: `7${Date.now()}`.slice(-10),
      firstName: 'Other',
      lastName: 'Patient',
    },
  });
  const otherAdmission = await prisma.ipdAdmission.create({
    data: {
      hospitalId: otherHospital.id,
      branchId: otherBranch.id,
      patientId: otherPatient.id,
      admissionNumber: `ADM-ISO-${isoSuffix}`,
    },
  });

  const crossBed = await request('GET', `/ipd/beds/${otherBed.id}`, { token });
  if (crossBed.status === 404) {
    pass('18 cross-hospital bed access blocked');
  } else {
    fail('18 cross-hospital bed access blocked', `${crossBed.status}`);
  }

  const crossAdmission = await request('GET', `/ipd/admissions/${otherAdmission.id}`, { token });
  if (crossAdmission.status === 404) {
    pass('19 cross-hospital admission access blocked');
  } else {
    fail('19 cross-hospital admission access blocked', `${crossAdmission.status}`);
  }

  const noAuth = await request('GET', '/ipd/beds');
  if (noAuth.status === 401) {
    pass('20 missing JWT rejected', '401');
  } else {
    fail('20 missing JWT rejected', `${noAuth.status}`);
  }

  const limitedRole = await prisma.role.create({
    data: {
      hospitalId,
      name: `NO-IPD-${runId}`,
      description: 'No IPD permissions',
    },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited IPD User',
      email: `no-ipd-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: { email: limitedUser.email, password: 'MediOS@12345' },
  });
  const permissionDenied = await request('GET', '/ipd/beds', {
    token: limitedLogin.body?.accessToken,
  });
  if (permissionDenied.status === 403) {
    pass('21 missing permission rejected', '403');
  } else {
    fail('21 missing permission rejected', `${permissionDenied.status}`);
  }

  const concurrentBed = await request('POST', '/ipd/beds', {
    token,
    body: {
      branchId: branch.id,
      wardName: `Concurrent-${branchSuffix}`,
      roomNumber: '201',
      bedNumber: '1',
    },
  });
  const concurrentBedId = concurrentBed.body?.id;
  const concurrentPatientA = await createPatient(token);
  const concurrentPatientB = await createPatient(token);
  const concurrentAdmA = await request('POST', '/ipd/admissions', {
    token,
    body: { patientId: concurrentPatientA, branchId: branch.id, reason: 'A' },
  });
  const concurrentAdmB = await request('POST', '/ipd/admissions', {
    token,
    body: { patientId: concurrentPatientB, branchId: branch.id, reason: 'B' },
  });
  const [allocA, allocB] = await Promise.all([
    request('POST', `/ipd/admissions/${concurrentAdmA.body.id}/bed`, {
      token,
      body: { bedId: concurrentBedId },
    }),
    request('POST', `/ipd/admissions/${concurrentAdmB.body.id}/bed`, {
      token,
      body: { bedId: concurrentBedId },
    }),
  ]);
  const allocStatuses = [allocA.status, allocB.status].sort();
  const oneSuccess =
    (allocA.status === 200 || allocA.status === 201) !==
    (allocB.status === 200 || allocB.status === 201);
  const oneConflict = allocStatuses.includes(409);
  if (oneSuccess && oneConflict) {
    pass('22 concurrent same-bed allocation', `${allocA.status}/${allocB.status}`);
  } else {
    fail('22 concurrent same-bed allocation', `${allocA.status}/${allocB.status}`);
  }

  const transferTargetBed = await request('POST', '/ipd/beds', {
    token,
    body: {
      branchId: branch.id,
      wardName: `Concurrent-${branchSuffix}`,
      roomNumber: '202',
      bedNumber: '1',
    },
  });
  const transferTargetBedId = transferTargetBed.body?.id;
  const tpA = await createPatient(token);
  const tpB = await createPatient(token);
  const bedForA = await request('POST', '/ipd/beds', {
    token,
    body: {
      branchId: branch.id,
      wardName: `Concurrent-${branchSuffix}`,
      roomNumber: '203',
      bedNumber: '1',
    },
  });
  const bedForB = await request('POST', '/ipd/beds', {
    token,
    body: {
      branchId: branch.id,
      wardName: `Concurrent-${branchSuffix}`,
      roomNumber: '204',
      bedNumber: '1',
    },
  });
  const admTpA = await request('POST', '/ipd/admissions', {
    token,
    body: {
      patientId: tpA,
      branchId: branch.id,
      bedId: bedForA.body.id,
      reason: 'Transfer A',
    },
  });
  const admTpB = await request('POST', '/ipd/admissions', {
    token,
    body: {
      patientId: tpB,
      branchId: branch.id,
      bedId: bedForB.body.id,
      reason: 'Transfer B',
    },
  });
  const [trA, trB] = await Promise.all([
    request('POST', `/ipd/admissions/${admTpA.body.id}/transfer`, {
      token,
      body: { newBedId: transferTargetBedId },
    }),
    request('POST', `/ipd/admissions/${admTpB.body.id}/transfer`, {
      token,
      body: { newBedId: transferTargetBedId },
    }),
  ]);
  const trOneSuccess =
    (trA.status === 200 || trA.status === 201) !==
    (trB.status === 200 || trB.status === 201);
  const trOneConflict = [trA.status, trB.status].includes(409);
  if (trOneSuccess && trOneConflict) {
    pass('23 concurrent transfer to same bed', `${trA.status}/${trB.status}`);
  } else {
    fail('23 concurrent transfer to same bed', `${trA.status}/${trB.status}`);
  }

  const bedAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'IPD_BED_CREATED', entityId: bedId },
  });
  const admissionAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'IPD_ADMISSION_CREATED', entityId: admissionId },
  });
  const dischargeAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'IPD_ADMISSION_DISCHARGED', entityId: admissionId },
  });
  if (bedAudit && admissionAudit && dischargeAudit) {
    pass('24 audit events recorded');
  } else {
    fail('24 audit events recorded', JSON.stringify({ bedAudit: !!bedAudit, admissionAudit: !!admissionAudit, dischargeAudit: !!dischargeAudit }));
  }

  const allocateOnlyPatient = await createPatient(token);
  const allocateOnlyAdmission = await request('POST', '/ipd/admissions', {
    token,
    body: {
      patientId: allocateOnlyPatient,
      branchId: branch.id,
      reason: 'Bed allocated separately',
    },
  });
  const separateAllocate = await request('POST', `/ipd/admissions/${allocateOnlyAdmission.body.id}/bed`, {
    token,
    body: { bedId: bed3Id },
  });
  if (
    separateAllocate.status === 200 ||
    (separateAllocate.status === 201 && separateAllocate.body?.currentBed?.id === bed3Id)
  ) {
    pass('25 separate bed allocation');
  } else {
    fail('25 separate bed allocation', `${separateAllocate.status} ${JSON.stringify(separateAllocate.body)}`);
  }

  await prisma.ipdBedAssignment.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.ipdAdmission.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.ipdBed.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: otherHospital.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: limitedUser.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: limitedRole.id } }).catch(() => {});

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
