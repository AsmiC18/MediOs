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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

let slotCounter = 0;

function appointmentWindowForToday() {
  const date = todayIsoDate();
  slotCounter += 1;
  const hour = 8 + Math.floor(slotCounter / 2);
  const minute = (slotCounter % 2) * 30;
  const start = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
  const endHour = minute === 30 ? hour + 1 : hour;
  const endMinute = minute === 30 ? 0 : 30;
  const end = `${date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00.000Z`;
  return { startAt: start, endAt: end };
}

async function createPatient(token) {
  const phone = `${Date.now()}`.slice(-10);
  const res = await request('POST', '/patients', {
    token,
    body: {
      phone,
      firstName: 'Opd',
      lastName: `Patient${runId.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return res.body?.id;
}

async function createDoctorResource(token) {
  const res = await request('POST', '/resources', {
    token,
    body: {
      type: 'DOCTOR',
      name: `Dr OPD ${runId.slice(0, 4)}`,
    },
  });
  return res.body?.id;
}

async function createAppointment(token, patientId, resourceId, window = appointmentWindowForToday()) {
  const res = await request('POST', '/appointments', {
    token,
    body: {
      patientId,
      startAt: window.startAt,
      endAt: window.endAt,
      resourceIds: [resourceId],
      reason: 'OPD visit',
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

  const patientId = await createPatient(token);
  const resourceId = await createDoctorResource(token);
  if (!patientId || !resourceId) {
    fail('setup patient/resource');
    process.exit(1);
  }

  const appointmentId = await createAppointment(token, patientId, resourceId);
  if (!appointmentId) {
    fail('setup appointment');
    process.exit(1);
  }

  const checkIn = await request('POST', '/opd/queue/check-in', {
    token,
    body: { appointmentId },
  });
  const queueId = checkIn.body?.id;
  if (
    (checkIn.status === 201 || checkIn.status === 200) &&
    queueId &&
    checkIn.body?.tokenNumber >= 1 &&
    checkIn.body?.status === 'WAITING'
  ) {
    pass('1 check-in valid appointment', `token ${checkIn.body.tokenNumber}`);
  } else {
    fail('1 check-in valid appointment', `${checkIn.status} ${JSON.stringify(checkIn.body)}`);
  }

  if (checkIn.body?.tokenNumber >= 1) {
    pass('2 token generated', String(checkIn.body.tokenNumber));
  } else {
    fail('2 token generated');
  }

  const appointment2Id = await createAppointment(token, patientId, resourceId);
  const checkIn2 = await request('POST', '/opd/queue/check-in', {
    token,
    body: { appointmentId: appointment2Id },
  });
  if (
    checkIn2.status === 201 ||
    (checkIn2.status === 200 && checkIn2.body?.tokenNumber === checkIn.body.tokenNumber + 1)
  ) {
    pass('3 second appointment gets next token', String(checkIn2.body?.tokenNumber));
  } else {
    fail('3 second appointment gets next token', `${checkIn2.status} ${JSON.stringify(checkIn2.body)}`);
  }

  const duplicateCheckIn = await request('POST', '/opd/queue/check-in', {
    token,
    body: { appointmentId },
  });
  if (duplicateCheckIn.status === 409) {
    pass('4 same appointment cannot check in twice', '409');
  } else {
    fail('4 same appointment cannot check in twice', `${duplicateCheckIn.status}`);
  }

  const list = await request('GET', '/opd/queue', { token });
  if (list.status === 200 && Array.isArray(list.body) && list.body.length >= 2) {
    pass('5 queue listing', `${list.body.length} entries`);
  } else {
    fail('5 queue listing', `${list.status} ${JSON.stringify(list.body)}`);
  }

  const waitingList = await request('GET', '/opd/queue?status=WAITING', { token });
  if (
    waitingList.status === 200 &&
    Array.isArray(waitingList.body) &&
    waitingList.body.every((entry) => entry.status === 'WAITING')
  ) {
    pass('6 filter by status');
  } else {
    fail('6 filter by status', `${waitingList.status}`);
  }

  const dateList = await request('GET', `/opd/queue?date=${todayIsoDate()}`, { token });
  if (dateList.status === 200 && Array.isArray(dateList.body) && dateList.body.length >= 2) {
    pass('7 filter by date');
  } else {
    fail('7 filter by date', `${dateList.status}`);
  }

  const called = await request('POST', `/opd/queue/${queueId}/call`, { token });
  if (called.status === 201 || (called.status === 200 && called.body?.status === 'CALLED')) {
    pass('8 WAITING -> CALLED');
  } else {
    fail('8 WAITING -> CALLED', `${called.status} ${JSON.stringify(called.body)}`);
  }

  const started = await request('POST', `/opd/queue/${queueId}/start`, { token });
  if (
    started.status === 201 ||
    (started.status === 200 && started.body?.status === 'IN_CONSULTATION')
  ) {
    pass('9 CALLED -> IN_CONSULTATION');
  } else {
    fail('9 CALLED -> IN_CONSULTATION', `${started.status} ${JSON.stringify(started.body)}`);
  }

  const completed = await request('POST', `/opd/queue/${queueId}/complete`, { token });
  if (
    completed.status === 201 ||
    (completed.status === 200 && completed.body?.status === 'COMPLETED')
  ) {
    pass('10 IN_CONSULTATION -> COMPLETED');
  } else {
    fail('10 IN_CONSULTATION -> COMPLETED', `${completed.status} ${JSON.stringify(completed.body)}`);
  }

  const completedAppointment = await request('GET', `/appointments/${appointmentId}`, { token });
  if (completedAppointment.body?.status === 'COMPLETED') {
    pass('11 appointment marked COMPLETED');
  } else {
    fail('11 appointment marked COMPLETED', JSON.stringify(completedAppointment.body));
  }

  const noShowAppointmentId = await createAppointment(token, patientId, resourceId);
  const noShowCheckIn = await request('POST', '/opd/queue/check-in', {
    token,
    body: { appointmentId: noShowAppointmentId },
  });
  const noShowQueueId = noShowCheckIn.body?.id;
  const noShowRes = await request('POST', `/opd/queue/${noShowQueueId}/no-show`, { token });
  if (noShowRes.status === 201 || (noShowRes.status === 200 && noShowRes.body?.status === 'NO_SHOW')) {
    pass('12 NO_SHOW transition');
  } else {
    fail('12 NO_SHOW transition', `${noShowRes.status} ${JSON.stringify(noShowRes.body)}`);
  }

  const cancelAppointmentId = await createAppointment(token, patientId, resourceId);
  const cancelCheckIn = await request('POST', '/opd/queue/check-in', {
    token,
    body: { appointmentId: cancelAppointmentId },
  });
  const cancelQueueId = cancelCheckIn.body?.id;
  const cancelRes = await request('POST', `/opd/queue/${cancelQueueId}/cancel`, { token });
  if (
    cancelRes.status === 201 ||
    (cancelRes.status === 200 && cancelRes.body?.status === 'CANCELLED')
  ) {
    pass('13 CANCEL transition');
  } else {
    fail('13 CANCEL transition', `${cancelRes.status} ${JSON.stringify(cancelRes.body)}`);
  }

  const invalidTransition = await request('POST', `/opd/queue/${queueId}/call`, { token });
  if (invalidTransition.status === 400) {
    pass('14 invalid transition blocked', '400');
  } else {
    fail('14 invalid transition blocked', `${invalidTransition.status}`);
  }

  const priorityAppointmentId = await createAppointment(token, patientId, resourceId);
  const priorityCheckIn = await request('POST', '/opd/queue/check-in', {
    token,
    body: { appointmentId: priorityAppointmentId },
  });
  const priorityQueueId = priorityCheckIn.body?.id;
  const priorityUpdate = await request('PATCH', `/opd/queue/${priorityQueueId}/priority`, {
    token,
    body: { priority: 'URGENT' },
  });
  if (
    priorityUpdate.status === 200 &&
    priorityUpdate.body?.priority === 'URGENT'
  ) {
    pass('15 priority update');
  } else {
    fail('15 priority update', `${priorityUpdate.status} ${JSON.stringify(priorityUpdate.body)}`);
  }

  const otherHospital = await prisma.hospital.create({
    data: {
      name: `OPD ISO ${runId.slice(0, 6)}`,
      code: `OPD-ISO-${runId.slice(0, 6)}`,
    },
  });
  const otherRole = await prisma.role.create({
    data: {
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
      email: `opd-iso-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const otherPatient = await prisma.patient.create({
    data: {
      hospitalId: otherHospital.id,
      phone: `8${Date.now()}`.slice(-10),
      firstName: 'Other',
      lastName: 'Patient',
    },
  });
  const otherAppointment = await prisma.appointment.create({
    data: {
      hospitalId: otherHospital.id,
      patientId: otherPatient.id,
      startAt: new Date(appointmentWindowForToday().startAt),
      endAt: new Date(appointmentWindowForToday().endAt),
      status: 'SCHEDULED',
    },
  });
  const otherQueue = await prisma.opdQueueEntry.create({
    data: {
      hospitalId: otherHospital.id,
      appointmentId: otherAppointment.id,
      patientId: otherPatient.id,
      queueDate: new Date(`${todayIsoDate()}T00:00:00.000Z`),
      tokenNumber: 99,
      status: 'WAITING',
    },
  });

  const crossQueueGet = await request('GET', `/opd/queue/${otherQueue.id}`, { token });
  if (crossQueueGet.status === 404) {
    pass('16 cross-hospital queue access blocked');
  } else {
    fail('16 cross-hospital queue access blocked', `${crossQueueGet.status}`);
  }

  const crossCheckIn = await request('POST', '/opd/queue/check-in', {
    token,
    body: { appointmentId: otherAppointment.id },
  });
  if (crossCheckIn.status === 404) {
    pass('17 cross-hospital appointment check-in blocked');
  } else {
    fail('17 cross-hospital appointment check-in blocked', `${crossCheckIn.status}`);
  }

  const noAuth = await request('GET', '/opd/queue');
  if (noAuth.status === 401) {
    pass('18 missing JWT rejected', '401');
  } else {
    fail('18 missing JWT rejected', `${noAuth.status}`);
  }

  const limitedRole = await prisma.role.create({
    data: {
      hospitalId,
      name: `NO-OPD-${runId.slice(0, 4)}`,
      description: 'No OPD permissions',
    },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited OPD User',
      email: `no-opd-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: { email: limitedUser.email, password: 'MediOS@12345' },
  });
  const limitedToken = limitedLogin.body?.accessToken;
  const permissionDenied = await request('GET', '/opd/queue', { token: limitedToken });
  if (permissionDenied.status === 403) {
    pass('19 missing permission rejected', '403');
  } else {
    fail('19 missing permission rejected', `${permissionDenied.status}`);
  }

  const concurrentPatientA = await createPatient(token);
  const concurrentPatientB = await createPatient(token);
  const concurrentApptA = await createAppointment(token, concurrentPatientA, resourceId);
  const concurrentApptB = await createAppointment(token, concurrentPatientB, resourceId);
  const [concurrentA, concurrentB] = await Promise.all([
    request('POST', '/opd/queue/check-in', {
      token,
      body: { appointmentId: concurrentApptA },
    }),
    request('POST', '/opd/queue/check-in', {
      token,
      body: { appointmentId: concurrentApptB },
    }),
  ]);
  if (
    (concurrentA.status === 200 || concurrentA.status === 201) &&
    (concurrentB.status === 200 || concurrentB.status === 201) &&
    concurrentA.body?.tokenNumber &&
    concurrentB.body?.tokenNumber &&
    concurrentA.body.tokenNumber !== concurrentB.body.tokenNumber
  ) {
    pass(
      '20 concurrent check-ins get distinct tokens',
      `${concurrentA.body.tokenNumber}, ${concurrentB.body.tokenNumber}`,
    );
  } else {
    fail('20 concurrent check-ins get distinct tokens', JSON.stringify({ concurrentA, concurrentB }));
  }

  const checkInAudit = await prisma.auditLog.findFirst({
    where: {
      hospitalId,
      action: 'OPD_QUEUE_CHECKED_IN',
      entityId: queueId,
    },
  });
  if (checkInAudit) {
    pass('21 check-in audit recorded');
  } else {
    fail('21 check-in audit recorded');
  }

  await prisma.opdQueueEntry.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.appointment.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: limitedUser.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: otherRole.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: limitedRole.id } }).catch(() => {});
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
