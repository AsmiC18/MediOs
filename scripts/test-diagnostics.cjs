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
      firstName: 'Diag',
      lastName: `Patient${runId.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return res.body?.id;
}

async function setupEncounter(token, prisma, hospitalId) {
  const branch = await prisma.branch.upsert({
    where: {
      hospitalId_code: { hospitalId, code: `DGN-${runId.slice(0, 4)}` },
    },
    update: {},
    create: {
      hospitalId,
      name: `Diag Branch ${runId.slice(0, 4)}`,
      code: `DGN-${runId.slice(0, 4)}`,
    },
  });

  const patientId = await createPatient(token);
  const resourceRes = await request('POST', '/resources', {
    token,
    body: { type: 'DOCTOR', name: `Dr Diag ${runId.slice(0, 4)}` },
  });
  const resourceId = resourceRes.body?.id;
  const date = new Date().toISOString().slice(0, 10);
  const appointmentRes = await request('POST', '/appointments', {
    token,
    body: {
      patientId,
      branchId: branch.id,
      startAt: `${date}T09:00:00.000Z`,
      endAt: `${date}T09:30:00.000Z`,
      resourceIds: [resourceId],
      reason: 'Diagnostic visit',
    },
  });
  const appointmentId = appointmentRes.body?.id;
  const encounterRes = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId, encounterType: 'OPD', appointmentId },
  });

  return {
    branch,
    patientId,
    appointmentId,
    encounterId: encounterRes.body?.id,
    encounterBranchId: encounterRes.body?.branchId,
  };
}

async function createOrder(token, encounterId, tests) {
  return request('POST', '/diagnostics/orders', {
    token,
    body: {
      encounterId,
      priority: 'NORMAL',
      notes: 'Routine panel',
      tests,
    },
  });
}

async function flowOrderToProcessing(token, orderId) {
  await request('POST', `/diagnostics/orders/${orderId}/collect-sample`, { token });
  return request('POST', `/diagnostics/orders/${orderId}/start-processing`, { token });
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
    where: { name: 'diagnostics:read' },
    update: {},
    create: { name: 'diagnostics:read', description: 'View diagnostics' },
  });
  const diagRead = await prisma.permission.findUnique({ where: { name: 'diagnostics:read' } });
  const diagManage = await prisma.permission.upsert({
    where: { name: 'diagnostics:manage' },
    update: {},
    create: { name: 'diagnostics:manage', description: 'Manage diagnostics' },
  });
  const adminRole = await prisma.role.findFirst({ where: { hospitalId, name: 'ADMIN' } });
  if (adminRole) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRole.id, permissionId: diagRead.id },
      },
      update: {},
      create: { roleId: adminRole.id, permissionId: diagRead.id },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRole.id, permissionId: diagManage.id },
      },
      update: {},
      create: { roleId: adminRole.id, permissionId: diagManage.id },
    });
  }

  const ctx = await setupEncounter(token, prisma, hospitalId);
  if (!ctx.encounterId) {
    fail('setup encounter', 'missing encounter');
    process.exit(1);
  }

  const tests = [
    { testCode: 'CBC', testName: 'Complete Blood Count', specimenType: 'Blood' },
    { testCode: 'GLU', testName: 'Glucose', specimenType: 'Serum' },
  ];

  const createRes = await createOrder(token, ctx.encounterId, tests);
  const orderId = createRes.body?.id;
  const itemIds = (createRes.body?.items || []).map((i) => i.id);

  if (
    (createRes.status === 201 || createRes.status === 200) &&
    orderId &&
    createRes.body?.orderNumber?.startsWith('LAB-') &&
    createRes.body?.items?.length === 2 &&
    createRes.body?.patientId === ctx.patientId
  ) {
    pass('1 create diagnostic order', createRes.body.orderNumber);
  } else {
    fail('1 create diagnostic order', `${createRes.status} ${JSON.stringify(createRes.body)}`);
  }

  if (/^LAB-\d{6}$/.test(createRes.body?.orderNumber || '')) {
    pass('2 order number generated', createRes.body.orderNumber);
  } else {
    fail('2 order number generated', createRes.body?.orderNumber);
  }

  if (createRes.body?.items?.length === 2) {
    pass('3 multiple tests in one order');
  } else {
    fail('3 multiple tests in one order');
  }

  const getRes = await request('GET', `/diagnostics/orders/${orderId}`, { token });
  if (getRes.status === 200 && getRes.body?.id === orderId) {
    pass('4 get order');
  } else {
    fail('4 get order', `${getRes.status}`);
  }

  const listRes = await request('GET', '/diagnostics/orders', { token });
  if (listRes.status === 200 && Array.isArray(listRes.body) && listRes.body.some((o) => o.id === orderId)) {
    pass('5 list orders');
  } else {
    fail('5 list orders', `${listRes.status}`);
  }

  const filterPatient = await request('GET', `/diagnostics/orders?patientId=${ctx.patientId}`, { token });
  if (filterPatient.status === 200 && filterPatient.body.every((o) => o.patientId === ctx.patientId)) {
    pass('6 filter by patient');
  } else {
    fail('6 filter by patient', `${filterPatient.status}`);
  }

  const filterStatus = await request('GET', '/diagnostics/orders?status=ORDERED', { token });
  if (filterStatus.status === 200 && filterStatus.body.some((o) => o.id === orderId)) {
    pass('7 filter by status');
  } else {
    fail('7 filter by status', `${filterStatus.status}`);
  }

  const collectRes = await request('POST', `/diagnostics/orders/${orderId}/collect-sample`, { token });
  if (collectRes.status === 201 || (collectRes.status === 200 && collectRes.body?.status === 'SAMPLE_COLLECTED')) {
    pass('8 sample collection');
  } else {
    fail('8 sample collection', `${collectRes.status} ${JSON.stringify(collectRes.body)}`);
  }

  const processRes = await request('POST', `/diagnostics/orders/${orderId}/start-processing`, { token });
  if (processRes.status === 201 || (processRes.status === 200 && processRes.body?.status === 'PROCESSING')) {
    pass('9 processing');
  } else {
    fail('9 processing', `${processRes.status} ${JSON.stringify(processRes.body)}`);
  }

  const numericResult = await request('PATCH', `/diagnostics/order-items/${itemIds[0]}/result`, {
    token,
    body: {
      resultValue: '5.2',
      resultUnit: 'mmol/L',
      referenceRange: '3.9-6.1',
      resultFlag: 'NORMAL',
    },
  });
  if (numericResult.status === 200 && numericResult.body?.resultValue === '5.2') {
    pass('10 enter numeric result');
  } else {
    fail('10 enter numeric result', `${numericResult.status} ${JSON.stringify(numericResult.body)}`);
  }

  const textResult = await request('PATCH', `/diagnostics/order-items/${itemIds[1]}/result`, {
    token,
    body: {
      resultValue: 'Negative',
      resultFlag: 'NORMAL',
      resultNotes: 'Within expected range',
    },
  });
  if (textResult.status === 200 && textResult.body?.resultValue === 'Negative') {
    pass('11 enter textual result');
  } else {
    fail('11 enter textual result', `${textResult.status} ${JSON.stringify(textResult.body)}`);
  }

  const verifyRes = await request('POST', `/diagnostics/order-items/${itemIds[0]}/verify`, { token });
  if (verifyRes.status === 201 || (verifyRes.status === 200 && verifyRes.body?.verifiedAt)) {
    pass('12 verify result');
  } else {
    fail('12 verify result', `${verifyRes.status} ${JSON.stringify(verifyRes.body)}`);
  }

  const ctx2 = await setupEncounter(token, prisma, hospitalId);
  const pendingOrder = await createOrder(token, ctx2.encounterId, [
    { testCode: 'TSH', testName: 'Thyroid Stimulating Hormone', specimenType: 'Serum' },
  ]);
  const pendingItemId = pendingOrder.body?.items?.[0]?.id;
  await flowOrderToProcessing(token, pendingOrder.body.id);
  const verifyNoResult = await request('POST', `/diagnostics/order-items/${pendingItemId}/verify`, { token });
  if (verifyNoResult.status === 400) {
    pass('13 reject verification without result', '400');
  } else {
    fail('13 reject verification without result', `${verifyNoResult.status}`);
  }

  const completeRes = await request('POST', `/diagnostics/orders/${orderId}/complete`, { token });
  if (completeRes.status === 201 || (completeRes.status === 200 && completeRes.body?.status === 'COMPLETED')) {
    pass('14 complete order');
  } else {
    fail('14 complete order', `${completeRes.status} ${JSON.stringify(completeRes.body)}`);
  }

  const ctx3 = await setupEncounter(token, prisma, hospitalId);
  const incompleteOrder = await createOrder(token, ctx3.encounterId, [
    { testCode: 'ALT', testName: 'Alanine Aminotransferase', specimenType: 'Serum' },
    { testCode: 'AST', testName: 'Aspartate Aminotransferase', specimenType: 'Serum' },
  ]);
  const incompleteOrderId = incompleteOrder.body?.id;
  const incompleteItems = incompleteOrder.body?.items || [];
  await flowOrderToProcessing(token, incompleteOrderId);
  await request('PATCH', `/diagnostics/order-items/${incompleteItems[0].id}/result`, {
    token,
    body: { resultValue: '32', resultUnit: 'U/L' },
  });
  const incompleteComplete = await request('POST', `/diagnostics/orders/${incompleteOrderId}/complete`, { token });
  if (incompleteComplete.status === 400) {
    pass('15 reject completion when required result is missing', '400');
  } else {
    fail('15 reject completion when required result is missing', `${incompleteComplete.status}`);
  }

  const ctx4 = await setupEncounter(token, prisma, hospitalId);
  const cancelOrder = await createOrder(token, ctx4.encounterId, [
    { testCode: 'UA', testName: 'Urinalysis', specimenType: 'Urine' },
  ]);
  const cancelOrderId = cancelOrder.body?.id;
  const cancelRes = await request('POST', `/diagnostics/orders/${cancelOrderId}/cancel`, { token });
  if (cancelRes.status === 201 || (cancelRes.status === 200 && cancelRes.body?.status === 'CANCELLED')) {
    pass('16 cancel order');
  } else {
    fail('16 cancel order', `${cancelRes.status} ${JSON.stringify(cancelRes.body)}`);
  }

  const invalidTransition = await request('POST', `/diagnostics/orders/${orderId}/collect-sample`, { token });
  if (invalidTransition.status === 400) {
    pass('17 reject invalid transition', '400');
  } else {
    fail('17 reject invalid transition', `${invalidTransition.status}`);
  }

  const historyRes = await request('GET', `/patients/${ctx.patientId}/diagnostics`, { token });
  if (
    historyRes.status === 200 &&
    historyRes.body?.patientId === ctx.patientId &&
    historyRes.body?.orders?.some((o) => o.orderNumber === createRes.body.orderNumber)
  ) {
    pass('18 patient diagnostic history');
  } else {
    fail('18 patient diagnostic history', `${historyRes.status} ${JSON.stringify(historyRes.body)}`);
  }

  const otherHospital = await prisma.hospital.create({
    data: { name: `DGN ISO ${runId.slice(0, 6)}`, code: `DGN-ISO-${runId.slice(0, 6)}` },
  });
  const otherBranch = await prisma.branch.create({
    data: {
      hospitalId: otherHospital.id,
      name: 'Other Branch',
      code: `OB-${runId.slice(0, 4)}`,
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
  const otherRole = await prisma.role.create({
    data: { hospitalId: otherHospital.id, name: `R-${runId.slice(0, 4)}` },
  });
  const otherUser = await prisma.user.create({
    data: {
      hospitalId: otherHospital.id,
      roleId: otherRole.id,
      name: 'Other Provider',
      email: `other-dgn-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const otherEncounter = await prisma.clinicalEncounter.create({
    data: {
      hospitalId: otherHospital.id,
      branchId: otherBranch.id,
      patientId: otherPatient.id,
      providerUserId: otherUser.id,
      encounterType: 'OPD',
    },
  });
  const otherOrder = await prisma.diagnosticOrder.create({
    data: {
      hospitalId: otherHospital.id,
      branchId: otherBranch.id,
      patientId: otherPatient.id,
      encounterId: otherEncounter.id,
      orderNumber: 'LAB-999999',
      orderedByUserId: otherUser.id,
      items: {
        create: {
          hospitalId: otherHospital.id,
          testCode: 'SEC',
          testName: 'Secret Test',
          specimenType: 'Blood',
        },
      },
    },
    include: { items: true },
  });

  const crossOrder = await request('GET', `/diagnostics/orders/${otherOrder.id}`, { token });
  if (crossOrder.status === 404) {
    pass('19 cross-hospital order access blocked', '404');
  } else {
    fail('19 cross-hospital order access blocked', `${crossOrder.status}`);
  }

  const crossResult = await request('PATCH', `/diagnostics/order-items/${otherOrder.items[0].id}/result`, {
    token,
    body: { resultValue: 'Hacked' },
  });
  if (crossResult.status === 404) {
    pass('20 cross-hospital result access blocked', '404');
  } else {
    fail('20 cross-hospital result access blocked', `${crossResult.status}`);
  }

  const noJwt = await request('GET', '/diagnostics/orders');
  if (noJwt.status === 401) {
    pass('21 missing JWT rejected', '401');
  } else {
    fail('21 missing JWT rejected', `${noJwt.status}`);
  }

  const limitedRole = await prisma.role.create({
    data: {
      hospitalId,
      name: `NO-DGN-${runId.slice(0, 4)}`,
      description: 'No diagnostics permissions',
    },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited Diag User',
      email: `no-dgn-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: { email: limitedUser.email, password: 'MediOS@12345' },
  });
  const permissionDenied = await request('GET', '/diagnostics/orders', {
    token: limitedLogin.body?.accessToken,
  });
  if (permissionDenied.status === 403) {
    pass('22 missing permission rejected', '403');
  } else {
    fail('22 missing permission rejected', `${permissionDenied.status}`);
  }

  const orderAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'DIAGNOSTIC_ORDER_CREATED', entityId: orderId },
  });
  const sampleAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'DIAGNOSTIC_SAMPLE_COLLECTED', entityId: orderId },
  });
  const resultAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'DIAGNOSTIC_RESULT_ENTERED', entityId: itemIds[0] },
  });
  const resultMeta = JSON.stringify(resultAudit?.metadata || {});
  if (orderAudit && sampleAudit && resultAudit && !resultMeta.includes('5.2')) {
    pass('23 audit events without full result values');
  } else {
    fail('23 audit events', `order=${!!orderAudit} sample=${!!sampleAudit} result=${!!resultAudit} meta=${resultMeta}`);
  }

  if (createRes.body?.patientId === ctx.patientId) {
    pass('24 patient derived from encounter (not client-supplied)');
  } else {
    fail('24 patient derived from encounter', `order=${createRes.body?.patientId} encounter=${ctx.patientId}`);
  }

  if (createRes.body?.branchId === ctx.encounterBranchId || createRes.body?.branchId === ctx.branch.id) {
    pass('25 branch inherited from encounter');
  } else {
    fail('25 branch inherited from encounter', `branchId=${createRes.body?.branchId}`);
  }

  const cancelCtx = await setupEncounter(token, prisma, hospitalId);
  await request('POST', `/clinical/encounters/${cancelCtx.encounterId}/cancel`, { token });
  const orderOnCancelled = await createOrder(token, cancelCtx.encounterId, [
    { testCode: 'X', testName: 'Should Fail', specimenType: 'Blood' },
  ]);
  if (orderOnCancelled.status === 400) {
    pass('26 cancelled encounter rejected for diagnostics', '400');
  } else {
    fail('26 cancelled encounter rejected', `${orderOnCancelled.status}`);
  }

  const invalidTest = await createOrder(token, ctx.encounterId, [{ testCode: '', testName: 'Bad', specimenType: 'Blood' }]);
  if (invalidTest.status === 400) {
    pass('27 duplicate/invalid test input rejected', '400');
  } else {
    fail('27 duplicate/invalid test input rejected', `${invalidTest.status}`);
  }

  const modifyCompleted = await request('PATCH', `/diagnostics/order-items/${itemIds[1]}/result`, {
    token,
    body: { resultValue: 'Changed' },
  });
  if (modifyCompleted.status === 400) {
    pass('28 completed order cannot be modified', '400');
  } else {
    fail('28 completed order cannot be modified', `${modifyCompleted.status}`);
  }

  const processCancelled = await request('POST', `/diagnostics/orders/${cancelOrderId}/start-processing`, { token });
  if (processCancelled.status === 400) {
    pass('29 cancelled order cannot be processed', '400');
  } else {
    fail('29 cancelled order cannot be processed', `${processCancelled.status}`);
  }

  const concurrentEncounter = await setupEncounter(token, prisma, hospitalId);
  const concurrentPromises = Array.from({ length: 5 }, (_, i) =>
    createOrder(token, concurrentEncounter.encounterId, [
      { testCode: `C${i}`, testName: `Concurrent Test ${i}`, specimenType: 'Blood' },
    ]),
  );
  const concurrentResults = await Promise.all(concurrentPromises);
  const concurrentNumbers = concurrentResults
    .filter((r) => r.status === 201 || r.status === 200)
    .map((r) => r.body?.orderNumber)
    .filter(Boolean);
  const uniqueNumbers = new Set(concurrentNumbers);
  if (concurrentNumbers.length === 5 && uniqueNumbers.size === 5) {
    pass('30 concurrent order creation unique numbers', `${uniqueNumbers.size} orders`);
  } else {
    fail(
      '30 concurrent order creation unique numbers',
      `created=${concurrentNumbers.length} unique=${uniqueNumbers.size}`,
    );
  }

  await prisma.diagnosticOrderItem.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.diagnosticOrder.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.clinicalEncounter.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.role.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
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
