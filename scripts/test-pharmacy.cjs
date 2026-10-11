const bcrypt = require('bcrypt');
const { loginBody } = require('./lib/login-body.cjs');
const { ensureAdminPhase1Permissions } = require('./lib/ensure-admin-permissions.cjs');
const { testPhone } = require('./lib/test-phone.cjs');
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

function futureDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pastDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function createPatient(token) {
  const phone = testPhone('9');
  const res = await request('POST', '/patients', {
    token,
    body: {
      phone,
      firstName: 'Pharm',
      lastName: `Patient${runId.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return res.body?.id;
}

async function setupPrescription(token, prisma, hospitalId, quantity = 10) {
  const branch = await prisma.branch.upsert({
    where: { hospitalId_code: { hospitalId, code: `PHM-${runId.slice(0, 4)}` } },
    update: {},
    create: {
      hospitalId,
      name: `Pharm Branch ${runId.slice(0, 4)}`,
      code: `PHM-${runId.slice(0, 4)}`,
    },
  });
  const patientId = await createPatient(token);
  const resourceRes = await request('POST', '/resources', {
    token,
    body: { type: 'DOCTOR', name: `Dr Pharm ${runId.slice(0, 4)}` },
  });
  const date = new Date().toISOString().slice(0, 10);
  const appt = await request('POST', '/appointments', {
    token,
    body: {
      patientId,
      branchId: branch.id,
      startAt: `${date}T10:00:00.000Z`,
      endAt: `${date}T10:30:00.000Z`,
      resourceIds: [resourceRes.body?.id],
      reason: 'Pharmacy visit',
    },
  });
  const enc = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId, encounterType: 'OPD', appointmentId: appt.body?.id },
  });
  const rx = await request('POST', `/clinical/encounters/${enc.body?.id}/prescriptions`, {
    token,
    body: {
      items: [{ medicationName: `Med-${runId.slice(0, 4)}`, dosage: '500mg', quantity }],
    },
  });
  return {
    branch,
    patientId,
    prescriptionId: rx.body?.id,
    prescriptionItemId: rx.body?.items?.[0]?.id,
  };
}

async function main() {
  const prisma = new PrismaClient();

  const login = await request('POST', '/auth/login', {
    body: loginBody('admin@test.com'),
  });
  const token = login.body?.accessToken;
  const hospitalId = login.body?.user?.hospitalId;
  if (!token || !hospitalId) {
    fail('login');
    process.exit(1);
  }
  await ensureAdminPhase1Permissions(prisma, login.body.user.roleId);

  pass('login');

  const phRead = await prisma.permission.upsert({
    where: { name: 'pharmacy:read' },
    update: {},
    create: { name: 'pharmacy:read', description: 'View pharmacy' },
  });
  const phManage = await prisma.permission.upsert({
    where: { name: 'pharmacy:manage' },
    update: {},
    create: { name: 'pharmacy:manage', description: 'Manage pharmacy' },
  });
  const adminRole = await prisma.role.findFirst({ where: { hospitalId, name: 'ADMIN' } });
  if (adminRole) {
    for (const perm of [phRead, phManage]) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: perm.id },
      });
    }
  }

  const ctx = await setupPrescription(token, prisma, hospitalId, 10);
  const sku = `SKU-${uniqueSuffix}`;

  const productRes = await request('POST', '/pharmacy/products', {
    token,
    body: {
      name: `Paracetamol ${runId.slice(0, 4)}`,
      genericName: 'Acetaminophen',
      strength: '500mg',
      dosageForm: 'Tablet',
      unit: 'tablet',
      sku,
      branchId: ctx.branch.id,
      reorderLevel: 5,
    },
  });
  const productId = productRes.body?.id;
  if ((productRes.status === 201 || productRes.status === 200) && productId) {
    pass('1 product creation');
  } else {
    fail('1 product creation', `${productRes.status} ${JSON.stringify(productRes.body)}`);
  }

  const listProducts = await request('GET', '/pharmacy/products', { token });
  if (listProducts.status === 200 && listProducts.body.some((p) => p.id === productId)) {
    pass('2 product listing');
  } else {
    fail('2 product listing', `${listProducts.status}`);
  }

  const updateProduct = await request('PATCH', `/pharmacy/products/${productId}`, {
    token,
    body: { reorderLevel: 10 },
  });
  if (updateProduct.status === 200 && updateProduct.body?.reorderLevel === 10) {
    pass('3 product update');
  } else {
    fail('3 product update', `${updateProduct.status}`);
  }

  const batchNum = `B-${runId.slice(0, 6)}`;
  const batchRes = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: batchNum,
      expiryDate: futureDate(180),
      quantity: 100,
      sellingPrice: 2.5,
      branchId: ctx.branch.id,
    },
  });
  const batchId = batchRes.body?.id;
  if ((batchRes.status === 201 || batchRes.status === 200) && batchId && batchRes.body?.quantity === 100) {
    pass('5 batch creation');
  } else {
    fail('5 batch creation', `${batchRes.status} ${JSON.stringify(batchRes.body)}`);
  }

  const dupBatch = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: batchNum,
      expiryDate: futureDate(90),
      quantity: 10,
    },
  });
  if (dupBatch.status === 409 || dupBatch.status === 400) {
    pass('6 duplicate batch rejection', `${dupBatch.status}`);
  } else {
    fail('6 duplicate batch rejection', `${dupBatch.status}`);
  }

  const adjustIn = await request('POST', '/pharmacy/stock/adjust', {
    token,
    body: { batchId, movementType: 'ADJUSTMENT_IN', quantity: 5, reason: 'Found stock' },
  });
  if (adjustIn.status === 201 || (adjustIn.status === 200 && adjustIn.body?.quantity === 105)) {
    pass('7 stock adjustment in', `qty=${adjustIn.body?.quantity}`);
  } else {
    fail('7 stock adjustment in', `${adjustIn.status} ${JSON.stringify(adjustIn.body)}`);
  }

  const adjustOut = await request('POST', '/pharmacy/stock/adjust', {
    token,
    body: { batchId, movementType: 'ADJUSTMENT_OUT', quantity: 3, reason: 'Damaged' },
  });
  if (adjustOut.status === 201 || (adjustOut.status === 200 && adjustOut.body?.quantity === 102)) {
    pass('8 stock adjustment out', `qty=${adjustOut.body?.quantity}`);
  } else {
    fail('8 stock adjustment out', `${adjustOut.status}`);
  }

  const insufficient = await request('POST', '/pharmacy/stock/adjust', {
    token,
    body: { batchId, movementType: 'ADJUSTMENT_OUT', quantity: 9999 },
  });
  if (insufficient.status === 409) {
    pass('9 insufficient stock rejection', '409');
  } else {
    fail('9 insufficient stock rejection', `${insufficient.status}`);
  }

  const expiredBatch = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: `EXP-${runId.slice(0, 6)}`,
      expiryDate: pastDate(10),
      quantity: 50,
    },
  });
  const expiredBatchId = expiredBatch.body?.id;
  const expiredDispense = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: ctx.patientId,
      prescriptionId: ctx.prescriptionId,
      items: [
        {
          prescriptionItemId: ctx.prescriptionItemId,
          productId,
          batchId: expiredBatchId,
          quantity: 1,
        },
      ],
    },
  });
  if (expiredDispense.status === 400) {
    pass('10 expired batch rejection', '400');
  } else {
    fail('10 expired batch rejection', `${expiredDispense.status}`);
  }

  await request('PATCH', `/pharmacy/products/${productId}`, {
    token,
    body: { isActive: false },
  });
  const inactiveDispense = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: ctx.patientId,
      prescriptionId: ctx.prescriptionId,
      items: [
        {
          prescriptionItemId: ctx.prescriptionItemId,
          productId,
          batchId,
          quantity: 1,
        },
      ],
    },
  });
  if (inactiveDispense.status === 400) {
    pass('11 inactive product rejection', '400');
  } else {
    fail('11 inactive product rejection', `${inactiveDispense.status}`);
  }

  await request('PATCH', `/pharmacy/products/${productId}`, {
    token,
    body: { isActive: true },
  });

  const explicitDispense = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: ctx.patientId,
      prescriptionId: ctx.prescriptionId,
      branchId: ctx.branch.id,
      items: [
        {
          prescriptionItemId: ctx.prescriptionItemId,
          productId,
          batchId,
          quantity: 2,
        },
      ],
    },
  });
  const dispensingId = explicitDispense.body?.id;
  if (
    (explicitDispense.status === 201 || explicitDispense.status === 200) &&
    explicitDispense.body?.status === 'DISPENSED' &&
    explicitDispense.body?.items?.[0]?.batchId === batchId
  ) {
    pass('12 dispensing using explicit batch');
  } else {
    fail('12 dispensing using explicit batch', `${explicitDispense.status} ${JSON.stringify(explicitDispense.body)}`);
  }

  const batchA = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: `FEFO-A-${runId.slice(0, 4)}`,
      expiryDate: futureDate(30),
      quantity: 3,
      sellingPrice: 3,
    },
  });
  const batchB = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: `FEFO-B-${runId.slice(0, 4)}`,
      expiryDate: futureDate(60),
      quantity: 10,
      sellingPrice: 3,
    },
  });
  const ctxFefo = await setupPrescription(token, prisma, hospitalId, 5);
  const fefoDispense = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: ctxFefo.patientId,
      prescriptionId: ctxFefo.prescriptionId,
      items: [
        {
          prescriptionItemId: ctxFefo.prescriptionItemId,
          productId,
          quantity: 5,
        },
      ],
    },
  });
  const fefoBatchIds = (fefoDispense.body?.items || []).map((i) => i.batchId);
  if (
    (fefoDispense.status === 201 || fefoDispense.status === 200) &&
    fefoBatchIds.includes(batchA.body?.id) &&
    fefoDispense.body?.items?.length >= 1
  ) {
    pass('13 FEFO batch selection');
  } else {
    fail('13 FEFO batch selection', `${fefoDispense.status} batches=${fefoBatchIds.join(',')}`);
  }

  const ctxMulti = await setupPrescription(token, prisma, hospitalId, 8);
  await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: `MUL-1-${runId.slice(0, 4)}`,
      expiryDate: futureDate(20),
      quantity: 3,
      sellingPrice: 2,
    },
  });
  await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: `MUL-2-${runId.slice(0, 4)}`,
      expiryDate: futureDate(40),
      quantity: 10,
      sellingPrice: 2,
    },
  });
  const multiDispense = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: ctxMulti.patientId,
      prescriptionId: ctxMulti.prescriptionId,
      items: [{ prescriptionItemId: ctxMulti.prescriptionItemId, productId, quantity: 8 }],
    },
  });
  if (
    (multiDispense.status === 201 || multiDispense.status === 200) &&
    (multiDispense.body?.items?.length || 0) >= 2
  ) {
    pass('14 dispensing across multiple batches', `${multiDispense.body.items.length} lines`);
  } else {
    fail('14 dispensing across multiple batches', `${multiDispense.status} lines=${multiDispense.body?.items?.length}`);
  }

  const getDispense = await request('GET', `/pharmacy/dispensings/${dispensingId}`, { token });
  if (getDispense.status === 200 && getDispense.body?.prescriptionId === ctx.prescriptionId) {
    pass('15 prescription linkage');
  } else {
    fail('15 prescription linkage', `${getDispense.status}`);
  }

  const wrongPatient = await createPatient(token);
  const mismatch = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: wrongPatient,
      prescriptionId: ctx.prescriptionId,
      items: [{ prescriptionItemId: ctx.prescriptionItemId, productId, batchId, quantity: 1 }],
    },
  });
  if (mismatch.status === 400) {
    pass('16 patient/prescription mismatch rejection', '400');
  } else {
    fail('16 patient/prescription mismatch rejection', `${mismatch.status}`);
  }

  const ctxOver = await setupPrescription(token, prisma, hospitalId, 2);
  const overBatch = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: `OVER-${runId.slice(0, 4)}`,
      expiryDate: futureDate(100),
      quantity: 20,
      sellingPrice: 1,
    },
  });
  const over1 = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: ctxOver.patientId,
      prescriptionId: ctxOver.prescriptionId,
      items: [
        {
          prescriptionItemId: ctxOver.prescriptionItemId,
          productId,
          batchId: overBatch.body?.id,
          quantity: 1,
        },
      ],
    },
  });
  const over2 = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: ctxOver.patientId,
      prescriptionId: ctxOver.prescriptionId,
      items: [
        {
          prescriptionItemId: ctxOver.prescriptionItemId,
          productId,
          batchId: overBatch.body?.id,
          quantity: 2,
        },
      ],
    },
  });
  if (
    (over1.status === 201 || over1.status === 200) &&
    over2.status === 400
  ) {
    pass('17 over-dispensing rejection', '400 on second');
  } else {
    fail('17 over-dispensing rejection', `${over1.status}/${over2.status}`);
  }

  const ctxConc = await setupPrescription(token, prisma, hospitalId, 4);
  const concBatch = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId,
      batchNumber: `CONC-${runId.slice(0, 4)}`,
      expiryDate: futureDate(120),
      quantity: 2,
      sellingPrice: 1,
    },
  });
  const concBatchId = concBatch.body?.id;
  const concBody = {
    patientId: ctxConc.patientId,
    prescriptionId: ctxConc.prescriptionId,
    items: [
      {
        prescriptionItemId: ctxConc.prescriptionItemId,
        productId,
        batchId: concBatchId,
        quantity: 2,
      },
    ],
  };
  const [concA, concB] = await Promise.all([
    request('POST', '/pharmacy/dispensings', { token, body: concBody }),
    request('POST', '/pharmacy/dispensings', { token, body: concBody }),
  ]);
  const concSuccess = [concA, concB].filter((r) => r.status === 201 || r.status === 200).length;
  const concFail = [concA, concB].filter((r) => r.status === 409).length;
  const concFinal = await prisma.pharmacyBatch.findUnique({ where: { id: concBatchId } });
  if (concSuccess === 1 && concFail === 1 && concFinal?.quantity === 0) {
    pass('18 concurrent dispensing', '1 success, 1 conflict, stock=0');
  } else {
    fail(
      '18 concurrent dispensing',
      `success=${concSuccess} fail409=${concFail} stock=${concFinal?.quantity}`,
    );
  }

  const otherHospital = await prisma.hospital.create({
    data: { name: `PHM ISO ${runId.slice(0, 6)}`, code: `PHM-ISO-${runId.slice(0, 6)}` },
  });
  const otherProduct = await prisma.pharmacyProduct.create({
    data: {
      hospitalId: otherHospital.id,
      name: 'Secret Drug',
      unit: 'tablet',
    },
  });
  const crossProduct = await request('GET', `/pharmacy/products/${otherProduct.id}`, { token });
  if (crossProduct.status === 404) {
    pass('19 tenant isolation', '404');
  } else {
    fail('19 tenant isolation', `${crossProduct.status}`);
  }

  const limitedRole = await prisma.role.create({
    data: { hospitalId, name: `NO-PHM-${runId.slice(0, 4)}` },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited Pharm User',
      email: `no-phm-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: loginBody(limitedUser.email),
  });
  const permDenied = await request('GET', '/pharmacy/products', {
    token: limitedLogin.body?.accessToken,
  });
  if (permDenied.status === 403) {
    pass('20 permission enforcement', '403');
  } else {
    fail('20 permission enforcement', `${permDenied.status}`);
  }

  const productAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'PHARMACY_PRODUCT_CREATED', entityId: productId },
  });
  const dispenseAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'PHARMACY_DISPENSING_CREATED', entityId: dispensingId },
  });
  const auditMeta = JSON.stringify(dispenseAudit?.metadata || {});
  if (productAudit && dispenseAudit && !auditMeta.includes('medicationName')) {
    pass('21 audit events');
  } else {
    fail('21 audit events', `product=${!!productAudit} dispense=${!!dispenseAudit}`);
  }

  const deleteProduct = await request('DELETE', `/pharmacy/products/${productId}`, { token });
  if (deleteProduct.status === 200 && deleteProduct.body?.isActive === false) {
    pass('4 product deactivation');
  } else {
    fail('4 product deactivation', `${deleteProduct.status}`);
  }

  await request('PATCH', `/pharmacy/products/${productId}`, {
    token,
    body: { isActive: true },
  });

  const cancelRes = await request('POST', `/pharmacy/dispensings/${dispensingId}/cancel`, { token });
  const batchAfterCancel = await prisma.pharmacyBatch.findUnique({ where: { id: batchId } });
  if (
    (cancelRes.status === 201 || cancelRes.status === 200) &&
    cancelRes.body?.status === 'CANCELLED' &&
    batchAfterCancel?.quantity >= 102
  ) {
    pass('22 dispensing cancel restores stock');
  } else {
    fail('22 dispensing cancel restores stock', `${cancelRes.status} qty=${batchAfterCancel?.quantity}`);
  }

  const cancelAgain = await request('POST', `/pharmacy/dispensings/${dispensingId}/cancel`, { token });
  if (cancelAgain.status === 400) {
    pass('23 terminal dispensing cannot be cancelled again', '400');
  } else {
    fail('23 terminal dispensing cannot be cancelled again', `${cancelAgain.status}`);
  }

  const noRec = explicitDispense.body?.recommendation === undefined &&
    productRes.body?.recommendedTreatment === undefined;
  if (noRec) {
    pass('no automatic treatment recommendation');
  } else {
    fail('no automatic treatment recommendation');
  }

  await prisma.pharmacyDispensingItem.deleteMany({ where: { dispensing: { hospitalId: otherHospital.id } } }).catch(() => {});
  await prisma.pharmacyDispensing.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.pharmacyStockMovement.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.pharmacyBatch.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.pharmacyProduct.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
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
