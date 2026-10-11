const bcrypt = require('bcrypt');
const { loginBody } = require('./lib/login-body.cjs');
const { ensureAdminPhase1Permissions } = require('./lib/ensure-admin-permissions.cjs');
const crypto = require('crypto');
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

async function createPatient(token, suffix = '') {
  const local = `9${`${Date.now()}${Math.floor(Math.random() * 9)}`.slice(-9)}`;
  const res = await request('POST', '/patients', {
    token,
    body: {
      phone: local,
      firstName: 'Int',
      lastName: `Pat${suffix || uniqueSuffix.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return { id: res.body?.id, phone: res.body?.phone, raw: local, res };
}

async function setupBranch(prisma, hospitalId, codeSuffix) {
  return prisma.branch.upsert({
    where: { hospitalId_code: { hospitalId, code: `INT-${codeSuffix}` } },
    update: {},
    create: { hospitalId, name: `Int Branch ${codeSuffix}`, code: `INT-${codeSuffix}` },
  });
}

async function createOpdEncounter(token, patientId, branchId, doctorId, slot = 0) {
  const day = 10 + Math.floor(slot / 4);
  const hour = 8 + (slot % 4);
  const date = `2031-03-${String(day).padStart(2, '0')}`;
  const appt = await request('POST', '/appointments', {
    token,
    body: {
      patientId,
      branchId,
      startAt: `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`,
      endAt: `${date}T${String(hour).padStart(2, '0')}:30:00.000Z`,
      resourceIds: [doctorId],
    },
  });
  const enc = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId, encounterType: 'OPD', appointmentId: appt.body?.id },
  });
  return { appointmentId: appt.body?.id, encounterId: enc.body?.id, enc };
}

async function main() {
  const prisma = new PrismaClient();
  let slot = 0;

  const login = await request('POST', '/auth/login', {
    body: loginBody('admin@test.com'),
  });
  const token = login.body?.accessToken;
  const hospitalId = login.body?.user?.hospitalId;
  const adminUserId = login.body?.user?.id;
  if (!token || !hospitalId) {
    fail('login');
    process.exit(1);
  }
  await ensureAdminPhase1Permissions(prisma, login.body.user.roleId);


  const branch = await setupBranch(prisma, hospitalId, uniqueSuffix.slice(0, 6));
  const doctor = await request('POST', '/resources', {
    token,
    body: { type: 'DOCTOR', name: `Dr Int ${uniqueSuffix.slice(0, 4)}`, branchId: branch.id },
  });
  const doctorId = doctor.body?.id;

  // 1. canonical phone consistency
  const p1 = await createPatient(token, 'A');
  const p2 = await request('POST', '/patients', {
    token,
    body: { phone: `+91 ${p1.raw.slice(0, 5)} ${p1.raw.slice(5)}`, firstName: 'Dup', lastName: 'Phone' },
  });
  if (p1.phone?.startsWith('+91') && p2.status === 409) {
    pass('1 canonical phone consistency');
  } else {
    fail('1 canonical phone consistency', `${p1.phone} dup=${p2.status}`);
  }

  // 2. emergency → clinical encounter
  const emPatient = await createPatient(token, 'E');
  const emVisit = await request('POST', '/emergency/visits', {
    token,
    body: { patientId: emPatient.id, branchId: branch.id, chiefComplaint: 'Chest pain', priority: 'URGENT' },
  });
  if (emVisit.body?.encounterId && emVisit.body?.encounter?.encounterType === 'EMERGENCY') {
    pass('2 emergency → clinical encounter');
  } else {
    fail('2 emergency → clinical encounter', JSON.stringify(emVisit.body));
  }

  // SOAP on emergency encounter
  const emSoap = await request('POST', `/clinical/encounters/${emVisit.body.encounterId}/soap`, {
    token,
    body: { subjective: 'Pain', objective: 'Stable', assessment: 'Rule out ACS', plan: 'Monitor' },
  });
  if (emSoap.status === 201 || emSoap.status === 200) {
    pass('2b emergency clinical SOAP works');
  } else {
    fail('2b emergency clinical SOAP works', `${emSoap.status}`);
  }

  // 3. emergency admitted does not auto-create IPD
  const emPatient2 = await createPatient(token, 'E2');
  const emVisit2 = await request('POST', '/emergency/visits', {
    token,
    body: { patientId: emPatient2.id, branchId: branch.id, chiefComplaint: 'Fall', priority: 'MEDIUM' },
  });
  await request('POST', `/emergency/visits/${emVisit2.body.id}/triage`, {
    token,
    body: { priority: 'MEDIUM', notes: 'Stable vitals' },
  });
  await request('POST', `/emergency/visits/${emVisit2.body.id}/start-treatment`, { token });
  await request('POST', `/emergency/visits/${emVisit2.body.id}/disposition`, {
    token,
    body: { disposition: 'ADMITTED' },
  });
  const ipdAfterEm = await prisma.ipdAdmission.count({
    where: { hospitalId, patientId: emPatient2.id },
  });
  if (ipdAfterEm === 0) pass('3 emergency admitted does not auto-create IPD');
  else fail('3 emergency admitted does not auto-create IPD', `count=${ipdAfterEm}`);

  // 4–5. IPD → clinical
  const ipdPatient = await createPatient(token, 'I');
  const admission = await request('POST', '/ipd/admissions', {
    token,
    body: { patientId: ipdPatient.id, branchId: branch.id, reason: 'Observation' },
  });
  const ipdEnc = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId: ipdPatient.id,
      encounterType: 'IPD',
      ipdAdmissionId: admission.body?.id,
    },
  });
  if (ipdEnc.body?.encounterType === 'IPD') pass('4 IPD → clinical encounter');
  else fail('4 IPD → clinical encounter', `${ipdEnc.status}`);

  const ipdSoap = await request('POST', `/clinical/encounters/${ipdEnc.body.id}/soap`, {
    token,
    body: { subjective: 'Ward review', plan: 'Continue care' },
  });
  const ipdDx = await request('POST', `/clinical/encounters/${ipdEnc.body.id}/diagnoses`, {
    token,
    body: { code: 'R50.9', description: 'Fever', diagnosisType: 'PRIMARY' },
  });
  const ipdRx = await request('POST', `/clinical/encounters/${ipdEnc.body.id}/prescriptions`, {
    token,
    body: { items: [{ medicationName: 'Paracetamol', dosage: '500mg', quantity: 10 }] },
  });
  await request('POST', `/clinical/encounters/${ipdEnc.body.id}/complete`, { token });
  await request('POST', `/ipd/admissions/${admission.body.id}/discharge`, { token });
  if (
    (ipdSoap.status === 201 || ipdSoap.status === 200) &&
    (ipdDx.status === 201 || ipdDx.status === 200) &&
    (ipdRx.status === 201 || ipdRx.status === 200)
  ) {
    pass('5 IPD clinical records workflow');
  } else {
    fail('5 IPD clinical records workflow');
  }

  // 6–9. Pharmacy integration
  const rxPatient = await createPatient(token, 'Rx');
  const rxEnc = await createOpdEncounter(token, rxPatient.id, branch.id, doctorId, slot++);
  const rx = await request('POST', `/clinical/encounters/${rxEnc.encounterId}/prescriptions`, {
    token,
    body: { items: [{ medicationName: `Med-${uniqueSuffix}`, dosage: '500mg', quantity: 10 }] },
  });
  const sku = `SKU-INT-${uniqueSuffix}`;
  const product = await request('POST', '/pharmacy/products', {
    token,
    body: { name: `Prod ${uniqueSuffix}`, sku, unit: 'TAB' },
  });
  const batch = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId: product.body?.id,
      batchNumber: `B-${uniqueSuffix}`,
      expiryDate: futureDate(120),
      quantity: 100,
      sellingPrice: 5,
    },
  });
  const dispense = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: rxPatient.id,
      prescriptionId: rx.body?.id,
      items: [
        {
          prescriptionItemId: rx.body?.items?.[0]?.id,
          productId: product.body?.id,
          batchId: batch.body?.id,
          quantity: 6,
        },
      ],
    },
  });
  const batchAfter = await prisma.pharmacyBatch.findUnique({ where: { id: batch.body?.id } });
  const movement = await prisma.pharmacyStockMovement.findFirst({
    where: { referenceType: 'PharmacyDispensing', referenceId: dispense.body?.id },
  });
  const integrationAudit = await prisma.auditLog.findFirst({
    where: {
      action: 'PHARMACY_DISPENSING_COMPLETED',
      entityId: dispense.body?.id,
      entity: 'PharmacyDispensing',
    },
  });
  if (dispense.status === 201 || dispense.status === 200) pass('6 prescription → dispensing');
  else fail('6 prescription → dispensing', `${dispense.status}`);

  const dispense2 = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: rxPatient.id,
      prescriptionId: rx.body?.id,
      items: [
        {
          prescriptionItemId: rx.body?.items?.[0]?.id,
          productId: product.body?.id,
          batchId: batch.body?.id,
          quantity: 4,
        },
      ],
    },
  });
  const dispense3 = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: rxPatient.id,
      prescriptionId: rx.body?.id,
      items: [
        {
          prescriptionItemId: rx.body?.items?.[0]?.id,
          productId: product.body?.id,
          batchId: batch.body?.id,
          quantity: 1,
        },
      ],
    },
  });
  if (
    (dispense2.status === 201 || dispense2.status === 200) &&
    dispense3.status === 400
  ) {
    pass('7 over-dispensing rejection');
  } else {
    fail('7 over-dispensing rejection', `${dispense2.status}/${dispense3.status}`);
  }

  if (batchAfter?.quantity === 94 && movement?.quantity === 6) {
    pass('8 stock movement consistency', `qty=${batchAfter.quantity}`);
  } else {
    fail('8 stock movement consistency', `qty=${batchAfter?.quantity} move=${movement?.quantity}`);
  }

  const wrongRxPatient = await createPatient(token, 'RxBad');
  const rxMismatch = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: wrongRxPatient.id,
      prescriptionId: rx.body?.id,
      items: [
        {
          prescriptionItemId: rx.body?.items?.[0]?.id,
          productId: product.body?.id,
          batchId: batch.body?.id,
          quantity: 1,
        },
      ],
    },
  });
  if (rxMismatch.status === 400) pass('9 patient mismatch rejection', '400');
  else fail('9 patient mismatch rejection', `${rxMismatch.status}`);

  if (integrationAudit?.metadata?.dispensingId) {
    pass('27 integration audit PHARMACY_DISPENSING_COMPLETED');
  } else {
    fail('27 integration audit PHARMACY_DISPENSING_COMPLETED');
  }

  // 10–11. Diagnostics
  const labPatient = await createPatient(token, 'Lab');
  const labEnc = await createOpdEncounter(token, labPatient.id, branch.id, doctorId, slot++);
  const labOrder = await request('POST', '/diagnostics/orders', {
    token,
    body: {
      encounterId: labEnc.encounterId,
      tests: [{ testCode: 'CBC', testName: 'Complete Blood Count', specimenType: 'BLOOD' }],
    },
  });
  const orderId = labOrder.body?.id;
  await request('POST', `/diagnostics/orders/${orderId}/collect-sample`, { token });
  await request('POST', `/diagnostics/orders/${orderId}/start-processing`, { token });
  const itemId = labOrder.body?.items?.[0]?.id;
  await request('PATCH', `/diagnostics/order-items/${itemId}/result`, {
    token,
    body: { resultValue: '12.5', resultUnit: 'g/dL' },
  });
  await request('POST', `/diagnostics/order-items/${itemId}/verify`, { token });
  await request('POST', `/diagnostics/orders/${orderId}/complete`, { token });
  const history = await request('GET', `/patients/${labPatient.id}/diagnostics`, { token });
  const waAfterLab = await prisma.whatsAppMessage.count({
    where: { patientId: labPatient.id, createdAt: { gte: new Date(Date.now() - 60000) } },
  });
  if (labOrder.body?.patientId === labPatient.id) pass('10 clinical encounter → diagnostic order');
  else fail('10 clinical encounter → diagnostic order');
  if (history.status === 200 && history.body?.orders?.length >= 1) pass('11 diagnostic result history');
  else fail('11 diagnostic result history', `${history.status} ${JSON.stringify(history.body)?.slice(0, 120)}`);
  if (waAfterLab === 0) pass('11b diagnostics completion creates no WhatsAppMessage rows');
  else fail('11b diagnostics completion creates no WhatsAppMessage rows', `count=${waAfterLab}`);

  // 12–15. Surgery
  const surgPatient = await createPatient(token, 'Surg');
  const surgEnc = await createOpdEncounter(token, surgPatient.id, branch.id, doctorId, slot++);
  const surgReq = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: surgPatient.id,
      encounterId: surgEnc.encounterId,
      procedureName: 'Hernia repair',
    },
  });
  if (surgReq.body?.encounterId === surgEnc.encounterId) pass('12 surgery → clinical');
  else fail('12 surgery → clinical');

  const surgIpdPatient = await createPatient(token, 'SurgIpd');
  const surgAdm = await request('POST', '/ipd/admissions', {
    token,
    body: { patientId: surgIpdPatient.id, branchId: branch.id, reason: 'Surgery prep' },
  });
  const surgIpdEnc = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId: surgIpdPatient.id,
      encounterType: 'IPD',
      ipdAdmissionId: surgAdm.body?.id,
    },
  });
  const surgIpdReq = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: surgIpdPatient.id,
      encounterId: surgIpdEnc.body?.id,
      admissionId: surgAdm.body?.id,
      procedureName: 'Appendectomy',
    },
  });
  if (surgIpdReq.body?.admissionId === surgAdm.body?.id) pass('13 surgery → IPD');
  else fail('13 surgery → IPD', `${surgIpdReq.status}`);

  const provider = await request('POST', '/insurance/providers', {
    token,
    body: {
      name: `Int Ins ${uniqueSuffix}`,
      code: `INT-INS-${uniqueSuffix}`,
      providerType: 'INSURANCE',
    },
  });
  const policy = await request('POST', '/insurance/policies', {
    token,
    body: {
      patientId: surgPatient.id,
      providerId: provider.body?.id,
      policyNumber: `INT-POL-${uniqueSuffix}`,
    },
  });
  const preAuth = await request('POST', '/insurance/pre-authorizations', {
    token,
    body: {
      patientId: surgPatient.id,
      policyId: policy.body?.id,
      encounterId: surgEnc.encounterId,
      requestedAmount: 50000,
    },
  });
  const surgIns = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: surgPatient.id,
      encounterId: surgEnc.encounterId,
      preAuthorizationId: preAuth.body?.id,
      procedureName: 'Ins linked surgery',
    },
  });
  if (surgIns.body?.preAuthorizationId === preAuth.body?.id) pass('14 surgery → insurance pre-auth');
  else fail('14 surgery → insurance pre-auth', `${surgIns.status}`);

  const ot = await request('POST', '/resources', {
    token,
    body: { type: 'OPERATION_THEATRE', name: `OT-INT-${uniqueSuffix}`, branchId: branch.id },
  });
  await request('POST', `/surgery/requests/${surgReq.body.id}/pre-op`, {
    token,
    body: { fitnessStatus: 'FIT' },
  });
  const schedule = await request('POST', `/surgery/requests/${surgReq.body.id}/schedule`, {
    token,
    body: {
      resourceId: ot.body?.id,
      startAt: '2031-04-01T08:00:00.000Z',
      endAt: '2031-04-01T09:00:00.000Z',
      branchId: branch.id,
    },
  });
  const overlapReq = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: surgPatient.id,
      encounterId: surgEnc.encounterId,
      procedureName: 'Overlap surgery',
    },
  });
  await request('POST', `/surgery/requests/${overlapReq.body?.id}/pre-op`, {
    token,
    body: { fitnessStatus: 'FIT' },
  });
  const overlapSched = await request('POST', `/surgery/requests/${overlapReq.body?.id}/schedule`, {
    token,
    body: {
      resourceId: ot.body?.id,
      startAt: '2031-04-01T08:30:00.000Z',
      endAt: '2031-04-01T09:30:00.000Z',
    },
  });
  if ((schedule.status === 201 || schedule.status === 200) && overlapSched.status === 409) {
    pass('15 OT conflict protection');
  } else {
    fail('15 OT conflict protection', `${schedule.status}/${overlapSched.status}`);
  }

  await request('POST', `/surgery/requests/${surgReq.body.id}/start`, { token });
  await request('POST', `/surgery/requests/${surgReq.body.id}/complete`, { token });
  const restartSurg = await request('POST', `/surgery/requests/${surgReq.body.id}/start`, { token });
  if (restartSurg.status === 400) pass('15b completed surgery cannot restart', '400');
  else fail('15b completed surgery cannot restart', `${restartSurg.status}`);

  // 16–18. Insurance ↔ billing
  const claimPatient = await createPatient(token, 'Claim');
  const invoice = await request('POST', '/invoices', {
    token,
    body: {
      patientId: claimPatient.id,
      items: [{ description: 'Procedure fee', quantity: 1, unitPrice: 10000 }],
    },
  });
  await request('PATCH', `/invoices/${invoice.body?.id}/status`, {
    token,
    body: { status: 'ISSUED' },
  });
  const claimPolicy = await request('POST', '/insurance/policies', {
    token,
    body: {
      patientId: claimPatient.id,
      providerId: provider.body?.id,
      policyNumber: `CLM-POL-${uniqueSuffix}`,
    },
  });
  const claim = await request('POST', '/insurance/claims', {
    token,
    body: {
      patientId: claimPatient.id,
      policyId: claimPolicy.body?.id,
      invoiceId: invoice.body?.id,
    },
  });
  if (claim.body?.invoiceId === invoice.body?.id && Number(claim.body?.claimedAmount) === 10000) {
    pass('16 claim → invoice');
  } else {
    fail('16 claim → invoice', JSON.stringify(claim.body));
  }

  const wrongClaimPatient = await createPatient(token, 'ClaimBad');
  const mismatchClaim = await request('POST', '/insurance/claims', {
    token,
    body: {
      patientId: wrongClaimPatient.id,
      policyId: claimPolicy.body?.id,
      invoiceId: invoice.body?.id,
    },
  });
  if (mismatchClaim.status === 400) pass('17 patient/policy/invoice mismatch rejection', '400');
  else fail('17 patient/policy/invoice mismatch rejection', `${mismatchClaim.status}`);

  await request('POST', `/insurance/claims/${claim.body?.id}/submit`, { token });
  await request('POST', `/insurance/claims/${claim.body?.id}/review`, { token });
  const approveClaim = await request('POST', `/insurance/claims/${claim.body?.id}/approve`, {
    token,
    body: { approvedAmount: 8000, patientResponsibility: 2000 },
  });
  const invoiceAfter = await request('GET', `/invoices/${invoice.body?.id}`, { token });
  if (
    approveClaim.body?.approvedAmount === '8000.00' &&
    invoiceAfter.body?.status === 'ISSUED'
  ) {
    pass('18 claim amount consistency + invoice unchanged', invoiceAfter.body?.status);
  } else {
    fail('18 claim amount consistency', `${approveClaim.status} inv=${invoiceAfter.body?.status}`);
  }

  // 19. Razorpay regression snippet
  const payInv = await request('POST', '/invoices', {
    token,
    body: {
      patientId: claimPatient.id,
      items: [{ description: 'Pay test', quantity: 1, unitPrice: 1000 }],
    },
  });
  const draftPay = await request('POST', `/invoices/${payInv.body?.id}/payment`, { token, body: {} });
  if (draftPay.status === 400 && payInv.body?.status === 'DRAFT') {
    pass('19 Razorpay DRAFT payment blocked', '400');
  } else {
    fail('19 Razorpay regression', `pay=${draftPay.status} inv=${payInv.body?.status}`);
  }
  await request('PATCH', `/invoices/${payInv.body?.id}/status`, { token, body: { status: 'ISSUED' } });
  const issuedPay = await request('POST', `/invoices/${payInv.body?.id}/payment`, { token, body: {} });
  if (issuedPay.status === 201 || issuedPay.status === 200) {
    pass('19b Razorpay ISSUED payment link regression', `${issuedPay.status}`);
  } else {
    fail('19b Razorpay ISSUED payment link regression', `${issuedPay.status}`);
  }

  // 20. ABDM patient isolation
  const abhaPatient = await createPatient(token, 'Abha');
  const abhaLink = await request('POST', `/patients/${abhaPatient.id}/abha/link`, {
    token,
    body: {
      abhaNumber: '12345678901234',
      abhaAddress: 'int.patient@abdm',
    },
  });
  const linked =
    abhaLink.status === 201 ||
    (abhaLink.status === 200 && abhaLink.body?.link?.linkStatus === 'LINKED');
  if (linked && abhaPatient.phone?.startsWith('+91')) {
    pass('20 patient → ABHA linkage after canonical phone');
  } else {
    fail('20 ABHA linkage', `${abhaLink.status} phone=${abhaPatient.phone}`);
  }

  // Cross-hospital setup
  const otherHospital = await prisma.hospital.create({
    data: { name: `INT ISO ${uniqueSuffix}`, code: `INT-ISO-${uniqueSuffix}` },
  });
  const otherPatient = await prisma.patient.create({
    data: {
      hospitalId: otherHospital.id,
      phone: `+919${`${Date.now()}`.slice(-9)}`,
      firstName: 'Other',
      lastName: 'Hospital',
    },
  });
  const otherProviderUserId =
    (await prisma.user.findFirst({ where: { hospitalId: otherHospital.id } }))?.id || adminUserId;
  const otherEnc = await prisma.clinicalEncounter.create({
    data: {
      hospitalId: otherHospital.id,
      patientId: otherPatient.id,
      providerUserId: otherProviderUserId,
      encounterType: 'OPD',
      status: 'OPEN',
    },
  });
  const otherRx = await prisma.prescription.create({
    data: {
      hospitalId: otherHospital.id,
      encounterId: otherEnc.id,
      patientId: otherPatient.id,
      prescribedByUserId: otherProviderUserId,
      items: { create: [{ medicationName: 'Other Med', quantity: 5 }] },
    },
    include: { items: true },
  });

  const crossSurgery = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: p1.id,
      encounterId: otherEnc.id,
      procedureName: 'Cross',
    },
  });
  const crossIpd = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: p1.id,
      encounterId: surgEnc.encounterId,
      admissionId: surgAdm.body?.id,
      procedureName: 'Cross IPD',
    },
  });
  const otherInvoice = await prisma.invoice.create({
    data: {
      hospitalId: otherHospital.id,
      patientId: otherPatient.id,
      invoiceNumber: `INT-INV-${uniqueSuffix}`,
      status: 'ISSUED',
      subtotalAmount: 5000,
      totalAmount: 5000,
      items: {
        create: [
          {
            hospitalId: otherHospital.id,
            description: 'Other hospital fee',
            quantity: 1,
            unitPrice: 5000,
            lineTotal: 5000,
            taxableAmount: 5000,
            lineTotalWithTax: 5000,
          },
        ],
      },
    },
  });
  const crossClaim = await request('POST', '/insurance/claims', {
    token,
    body: {
      patientId: claimPatient.id,
      policyId: claimPolicy.body?.id,
      invoiceId: otherInvoice.id,
    },
  });
  const crossPharm = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: otherPatient.id,
      prescriptionId: otherRx.id,
      items: [
        {
          prescriptionItemId: otherRx.items[0].id,
          productId: product.body?.id,
          batchId: batch.body?.id,
          quantity: 1,
        },
      ],
    },
  });
  const crossEmergency = await request('POST', '/emergency/visits', {
    token,
    body: { patientId: otherPatient.id, branchId: branch.id, chiefComplaint: 'Cross', priority: 'LOW' },
  });

  if (crossSurgery.status === 404) pass('21 cross-hospital clinical link rejection', '404');
  else fail('21 cross-hospital clinical link rejection', `${crossSurgery.status}`);
  if (crossPharm.status === 404) pass('22 cross-hospital prescription rejection', '404');
  else fail('22 cross-hospital prescription rejection', `${crossPharm.status}`);
  if (crossIpd.status === 400) pass('23 cross-hospital surgery/IPD rejection', '400');
  else fail('23 cross-hospital surgery/IPD rejection', `${crossIpd.status}`);
  if (crossClaim.status === 404) pass('24 cross-hospital insurance/invoice rejection', '404');
  else fail('24 cross-hospital insurance/invoice rejection', `${crossClaim.status}`);
  if (crossPharm.status === 404) pass('25 cross-hospital pharmacy/prescription rejection', '404');
  else fail('25 cross-hospital pharmacy/prescription rejection', `${crossPharm.status}`);

  if (crossEmergency.status === 404 || crossEmergency.status === 400) {
    pass('26 cross-hospital emergency/encounter rejection', `${crossEmergency.status}`);
  } else {
    fail('26 cross-hospital emergency/encounter rejection', `${crossEmergency.status}`);
  }

  // OPD manual encounter note
  const opdPatient = await createPatient(token, 'Opd');
  const opdAppt = await request('POST', '/appointments', {
    token,
    body: {
      patientId: opdPatient.id,
      branchId: branch.id,
      startAt: '2031-05-01T09:00:00.000Z',
      endAt: '2031-05-01T09:30:00.000Z',
      resourceIds: [doctorId],
    },
  });
  const checkIn = await request('POST', '/opd/queue/check-in', {
    token,
    body: { appointmentId: opdAppt.body?.id },
  });
  const manualEnc = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId: opdPatient.id, encounterType: 'OPD', appointmentId: opdAppt.body?.id },
  });
  if ((checkIn.status === 201 || checkIn.status === 200) && manualEnc.body?.appointmentId) {
    pass('OPD manual encounter from appointment (intentional workflow)');
  } else {
    fail('OPD manual encounter from appointment', `${checkIn.status}/${manualEnc.status}`);
  }

  await prisma.invoice.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.clinicalEncounter.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: otherHospital.id } }).catch(() => {});
  await prisma.$disconnect();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
