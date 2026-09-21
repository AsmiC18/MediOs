const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');
const jwt = require(path.join(__dirname, '..', 'node_modules', 'jsonwebtoken'));

const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma/client'));

const BASE = 'http://localhost:3000';
const WEBHOOK_SECRET = 'test_webhook_secret_day3';
const APP_SECRET = 'test_whatsapp_app_secret';
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

function signRazorpayWebhook(rawBody) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function signWhatsAppWebhook(rawBody) {
  return `sha256=${crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;
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
      firstName: 'Sec',
      lastName: `Pat${suffix || uniqueSuffix.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return { id: res.body?.id, phone: res.body?.phone, raw: local, res };
}

async function setupOtherHospital(prisma, adminUserId) {
  const hospital = await prisma.hospital.create({
    data: { name: `SEC ISO ${uniqueSuffix}`, code: `SEC-ISO-${uniqueSuffix}` },
  });
  const branch = await prisma.branch.create({
    data: { hospitalId: hospital.id, name: 'Sec Branch', code: `SEC-B-${uniqueSuffix.slice(0, 6)}` },
  });
  const role = await prisma.role.create({
    data: { hospitalId: hospital.id, name: `SEC-ADMIN-${uniqueSuffix.slice(0, 4)}` },
  });
  for (const permName of ['patients:read', 'patients:create']) {
    const perm = await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: { name: permName, description: permName },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: perm.id },
    });
  }
  const user = await prisma.user.create({
    data: {
      hospitalId: hospital.id,
      roleId: role.id,
      name: 'Sec Hospital Admin',
      email: `sec-admin-${uniqueSuffix}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const patient = await prisma.patient.create({
    data: {
      hospitalId: hospital.id,
      phone: `+919${`${Date.now()}`.slice(-9)}`,
      firstName: 'Other',
      lastName: 'Patient',
    },
  });
  const providerUserId = user.id;
  const encounter = await prisma.clinicalEncounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      providerUserId,
      encounterType: 'OPD',
      status: 'OPEN',
    },
  });
  const prescription = await prisma.prescription.create({
    data: {
      hospitalId: hospital.id,
      encounterId: encounter.id,
      patientId: patient.id,
      prescribedByUserId: providerUserId,
      items: { create: [{ medicationName: 'Other Rx', quantity: 5 }] },
    },
    include: { items: true },
  });
  const product = await prisma.pharmacyProduct.create({
    data: { hospitalId: hospital.id, name: 'Other Drug', unit: 'TAB' },
  });
  const batch = await prisma.pharmacyBatch.create({
    data: {
      hospitalId: hospital.id,
      productId: product.id,
      batchNumber: `OB-${uniqueSuffix}`,
      expiryDate: new Date(futureDate(120)),
      quantity: 50,
      sellingPrice: 10,
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      invoiceNumber: `SEC-INV-${uniqueSuffix}`,
      status: 'ISSUED',
      subtotalAmount: 1000,
      totalAmount: 1000,
      items: {
        create: [
          {
            hospitalId: hospital.id,
            description: 'Other fee',
            quantity: 1,
            unitPrice: 1000,
            lineTotal: 1000,
            taxableAmount: 1000,
            lineTotalWithTax: 1000,
          },
        ],
      },
    },
  });
  const provider = await prisma.insuranceProvider.create({
    data: {
      hospitalId: hospital.id,
      name: 'Other Insurer',
      code: `SEC-INS-${uniqueSuffix}`,
      providerType: 'INSURANCE',
    },
  });
  const policy = await prisma.patientInsurancePolicy.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      providerId: provider.id,
      policyNumber: `SEC-POL-${uniqueSuffix}`,
    },
  });
  const claim = await prisma.insuranceClaim.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      policyId: policy.id,
      providerId: provider.id,
      invoiceId: invoice.id,
      claimNumber: `SEC-CLM-${uniqueSuffix}`,
      claimedAmount: 1000,
      status: 'DRAFT',
    },
  });
  const ot = await prisma.resource.create({
    data: {
      hospitalId: hospital.id,
      branchId: branch.id,
      type: 'OPERATION_THEATRE',
      name: `OT-SEC-${uniqueSuffix}`,
    },
  });
  const surgery = await prisma.surgeryRequest.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      encounterId: encounter.id,
      requestedByUserId: providerUserId,
      procedureName: 'Other surgery',
      status: 'REQUESTED',
    },
  });
  const admission = await prisma.ipdAdmission.create({
    data: {
      hospitalId: hospital.id,
      branchId: branch.id,
      patientId: patient.id,
      admissionNumber: `SEC-ADM-${uniqueSuffix}`,
      reason: 'Observation',
      status: 'ADMITTED',
    },
  });
  const diagnosticOrder = await prisma.diagnosticOrder.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      encounterId: encounter.id,
      orderNumber: `SEC-LAB-${uniqueSuffix}`,
      orderedByUserId: providerUserId,
      items: {
        create: [
          {
            hospitalId: hospital.id,
            testCode: 'CBC',
            testName: 'CBC',
            specimenType: 'BLOOD',
          },
        ],
      },
    },
    include: { items: true },
  });
  const emergencyEncounter = await prisma.clinicalEncounter.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      providerUserId,
      encounterType: 'EMERGENCY',
      status: 'OPEN',
    },
  });
  const emergencyVisit = await prisma.emergencyVisit.create({
    data: {
      hospitalId: hospital.id,
      branchId: branch.id,
      patientId: patient.id,
      encounterId: emergencyEncounter.id,
      chiefComplaint: 'Secret complaint',
      priority: 'URGENT',
    },
  });
  const abhaLink = await prisma.patientAbhaLink.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      abhaNumber: '99998888777766',
      abhaAddress: 'other@abdm',
      linkStatus: 'LINKED',
    },
  });
  const consent = await prisma.abdmConsent.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      purpose: 'CARE',
      hiTypes: ['Prescription'],
      status: 'GRANTED',
      requestedByUserId: providerUserId,
    },
  });
  const conversation = await prisma.whatsAppConversation.create({
    data: {
      hospitalId: hospital.id,
      patientId: patient.id,
      state: 'ACTIVE',
    },
  });

  void adminUserId;
  return {
    hospital,
    branch,
    user,
    patient,
    encounter,
    prescription,
    product,
    batch,
    invoice,
    policy,
    claim,
    ot,
    surgery,
    admission,
    diagnosticOrder,
    emergencyVisit,
    abhaLink,
    consent,
    conversation,
  };
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
    fail('setup login');
    process.exit(1);
  }

  const branch = await prisma.branch.upsert({
    where: { hospitalId_code: { hospitalId, code: `SEC-${uniqueSuffix.slice(0, 6)}` } },
    update: {},
    create: { hospitalId, name: 'Sec Branch A', code: `SEC-${uniqueSuffix.slice(0, 6)}` },
  });

  const other = await setupOtherHospital(prisma, adminUserId);
  const otherLogin = await request('POST', '/auth/login', {
    body: { email: other.user.email, password: 'MediOS@12345' },
  });
  const otherToken = otherLogin.body?.accessToken;

  // --- Authentication ---
  const noToken = await request('GET', '/patients');
  if (noToken.status === 401) pass('1 missing token rejected', '401');
  else fail('1 missing token rejected', `${noToken.status}`);

  const badToken = await request('GET', '/patients', { token: 'not.a.valid.jwt' });
  if (badToken.status === 401) pass('2 invalid token rejected', '401');
  else fail('2 invalid token rejected', `${badToken.status}`);

  const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const expiredToken = jwt.sign(
    { sub: adminUserId, hospitalId, roleId: login.body.user.roleId, role: 'ADMIN' },
    jwtSecret,
    { expiresIn: '-1h' },
  );
  const expiredRes = await request('GET', '/patients', { token: expiredToken });
  if (expiredRes.status === 401) pass('3 expired token rejected', '401');
  else fail('3 expired token rejected', `${expiredRes.status}`);

  // --- RBAC ---
  const limitedRole = await prisma.role.create({
    data: { hospitalId, name: `NO-SEC-${uniqueSuffix}` },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited User',
      email: `no-sec-${uniqueSuffix}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: { email: limitedUser.email, password: 'MediOS@12345' },
  });
  const limitedToken = limitedLogin.body?.accessToken;
  const noPerm = await request('GET', '/clinical/encounters', { token: limitedToken });
  if (noPerm.status === 403) pass('4 missing permission rejected', '403');
  else fail('4 missing permission rejected', `${noPerm.status}`);

  await prisma.permission.upsert({
    where: { name: 'clinical:read' },
    update: {},
    create: { name: 'clinical:read', description: 'Read clinical' },
  });
  const clinicalRead = await prisma.permission.findUnique({ where: { name: 'clinical:read' } });
  await prisma.rolePermission.create({
    data: { roleId: limitedRole.id, permissionId: clinicalRead.id },
  });
  const readOnly = await request('GET', '/clinical/encounters', { token: limitedToken });
  const writeDenied = await request('POST', '/clinical/encounters', {
    token: limitedToken,
    body: { patientId: (await createPatient(token)).id, encounterType: 'OPD' },
  });
  if (readOnly.status === 200 && writeDenied.status === 403) {
    pass('5 read vs manage permission', '200/403');
  } else {
    fail('5 read vs manage permission', `${readOnly.status}/${writeDenied.status}`);
  }

  // --- Tenant isolation ---
  const crossChecks = [
    ['6 cross-hospital patient', 'GET', `/patients/${other.patient.id}`, 404],
    ['7 cross-hospital invoice', 'GET', `/invoices/${other.invoice.id}`, 404],
    ['8 cross-hospital pharmacy product', 'GET', `/pharmacy/products/${other.product.id}`, 404],
    ['9 cross-hospital insurance claim', 'GET', `/insurance/claims/${other.claim.id}`, 404],
    ['10 cross-hospital surgery', 'GET', `/surgery/requests/${other.surgery.id}`, 404],
    ['11 cross-hospital clinical encounter', 'GET', `/clinical/encounters/${other.encounter.id}`, 404],
    ['12 cross-hospital emergency visit', 'GET', `/emergency/visits/${other.emergencyVisit.id}`, 404],
  ];
  for (const [name, method, p, expected] of crossChecks) {
    const res = await request(method, p, { token });
    if (res.status === expected) pass(name, `${expected}`);
    else fail(name, `${res.status}`);
  }

  const crossAbha = await request('GET', `/patients/${other.patient.id}/abha`, { token });
  if (crossAbha.status === 404) pass('12b cross-hospital ABHA blocked', '404');
  else fail('12b cross-hospital ABHA blocked', `${crossAbha.status}`);

  const crossConsent = await request('GET', `/abdm/consents/${other.consent.id}`, { token });
  if (crossConsent.status === 404) pass('12c cross-hospital consent blocked', '404');
  else fail('12c cross-hospital consent blocked', `${crossConsent.status}`);

  const crossWa = await request('GET', `/patients/${other.patient.id}/whatsapp/conversation`, {
    token,
  });
  if (crossWa.status === 404) pass('12d cross-hospital WhatsApp blocked', '404');
  else fail('12d cross-hospital WhatsApp blocked', `${crossWa.status}`);

  // --- Validation ---
  const badUuid = await request('GET', '/patients/not-a-uuid', { token });
  if ([400, 404].includes(badUuid.status)) pass('13 invalid UUID rejected', `${badUuid.status}`);
  else fail('13 invalid UUID rejected', `${badUuid.status}`);

  const patient = await createPatient(token, 'V');
  const badAmount = await request('POST', '/invoices', {
    token,
    body: {
      patientId: patient.id,
      items: [{ description: 'Bad', quantity: 1, unitPrice: -100 }],
    },
  });
  if (badAmount.status === 400) pass('14 invalid amount rejected', '400');
  else fail('14 invalid amount rejected', `${badAmount.status}`);

  const badQty = await request('POST', '/invoices', {
    token,
    body: {
      patientId: patient.id,
      items: [{ description: 'Bad qty', quantity: -1, unitPrice: 100 }],
    },
  });
  if (badQty.status === 400) pass('15 negative quantity rejected', '400');
  else fail('15 negative quantity rejected', `${badQty.status}`);

  const badEnum = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId: patient.id, encounterType: 'INVALID_TYPE' },
  });
  if (badEnum.status === 400) pass('16 invalid enum rejected', '400');
  else fail('16 invalid enum rejected', `${badEnum.status}`);

  const unexpectedField = await request('POST', '/patients', {
    token,
    body: {
      phone: `9${Date.now()}`.slice(-10),
      firstName: 'X',
      lastName: 'Y',
      hospitalId: other.hospital.id,
    },
  });
  if (unexpectedField.status === 400) pass('17 unexpected request field rejected', '400');
  else fail('17 unexpected request field rejected', `${unexpectedField.status}`);

  // --- State machines ---
  const doctor = await request('POST', '/resources', {
    token,
    body: { type: 'DOCTOR', name: `Dr Sec ${uniqueSuffix.slice(0, 4)}`, branchId: branch.id },
  });
  const appt = await request('POST', '/appointments', {
    token,
    body: {
      patientId: patient.id,
      branchId: branch.id,
      startAt: '2032-06-01T09:00:00.000Z',
      endAt: '2032-06-01T09:30:00.000Z',
      resourceIds: [doctor.body?.id],
    },
  });
  const enc = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId: patient.id, encounterType: 'OPD', appointmentId: appt.body?.id },
  });
  await request('POST', `/clinical/encounters/${enc.body?.id}/complete`, { token });
  const badClinical = await request('POST', `/clinical/encounters/${enc.body?.id}/complete`, {
    token,
  });
  if (badClinical.status === 400) pass('18 invalid clinical transition', '400');
  else fail('18 invalid clinical transition', `${badClinical.status}`);

  const emPat = await createPatient(token, 'EM');
  const emVisit = await request('POST', '/emergency/visits', {
    token,
    body: {
      patientId: emPat.id,
      branchId: branch.id,
      chiefComplaint: 'Pain',
      priority: 'URGENT',
    },
  });
  await request('POST', `/emergency/visits/${emVisit.body?.id}/disposition`, {
    token,
    body: { disposition: 'DISCHARGED' },
  });
  const badEm = await request('POST', `/emergency/visits/${emVisit.body?.id}/triage`, { token });
  if (badEm.status === 400) pass('19 invalid emergency transition', '400');
  else fail('19 invalid emergency transition', `${badEm.status}`);

  const surgPat = await createPatient(token, 'SRG');
  const surgAppt = await request('POST', '/appointments', {
    token,
    body: {
      patientId: surgPat.id,
      branchId: branch.id,
      startAt: '2032-06-02T09:00:00.000Z',
      endAt: '2032-06-02T09:30:00.000Z',
      resourceIds: [doctor.body?.id],
    },
  });
  const surgEnc = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId: surgPat.id, encounterType: 'OPD', appointmentId: surgAppt.body?.id },
  });
  const surgReq = await request('POST', '/surgery/requests', {
    token,
    body: {
      patientId: surgPat.id,
      encounterId: surgEnc.body?.id,
      procedureName: 'Test op',
    },
  });
  const badSurg = await request('POST', `/surgery/requests/${surgReq.body?.id}/start`, { token });
  if (badSurg.status === 400) pass('20 invalid surgery transition', '400');
  else fail('20 invalid surgery transition', `${badSurg.status}`);

  const insProvider = await request('POST', '/insurance/providers', {
    token,
    body: {
      name: `Sec Ins ${uniqueSuffix}`,
      code: `SEC-INS2-${uniqueSuffix}`,
      providerType: 'INSURANCE',
    },
  });
  const insPolicy = await request('POST', '/insurance/policies', {
    token,
    body: {
      patientId: surgPat.id,
      providerId: insProvider.body?.id,
      policyNumber: `SEC-POL2-${uniqueSuffix}`,
    },
  });
  const preAuth = await request('POST', '/insurance/pre-authorizations', {
    token,
    body: {
      patientId: surgPat.id,
      policyId: insPolicy.body?.id,
      encounterId: surgEnc.body?.id,
      requestedAmount: 5000,
    },
  });
  const badIns = await request('POST', `/insurance/pre-authorizations/${preAuth.body?.id}/approve`, {
    token,
    body: { approvedAmount: 99999 },
  });
  if (badIns.status === 400) pass('21 invalid insurance transition', '400');
  else fail('21 invalid insurance transition', `${badIns.status}`);

  const sku = `SEC-SKU-${uniqueSuffix}`;
  const product = await request('POST', '/pharmacy/products', {
    token,
    body: { name: 'Sec Product', sku, unit: 'TAB' },
  });
  const batch = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId: product.body?.id,
      batchNumber: `SB-${uniqueSuffix}`,
      expiryDate: futureDate(120),
      quantity: 20,
      sellingPrice: 5,
    },
  });
  const rxEnc = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId: patient.id, encounterType: 'EMERGENCY' },
  });
  const rx = await request('POST', `/clinical/encounters/${rxEnc.body?.id}/prescriptions`, {
    token,
    body: { items: [{ medicationName: 'Med', quantity: 2 }] },
  });
  await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: patient.id,
      prescriptionId: rx.body?.id,
      items: [
        {
          prescriptionItemId: rx.body?.items?.[0]?.id,
          productId: product.body?.id,
          batchId: batch.body?.id,
          quantity: 2,
        },
      ],
    },
  });
  const badPharm = await request('POST', '/pharmacy/dispensings', {
    token,
    body: {
      patientId: patient.id,
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
  if (badPharm.status === 400) pass('22 invalid pharmacy transition', '400');
  else fail('22 invalid pharmacy transition', `${badPharm.status}`);

  // --- Financial ---
  const paid = await (async () => {
    const inv = await request('POST', '/invoices', {
      token,
      body: {
        patientId: patient.id,
        items: [{ description: 'Refund test', quantity: 1, unitPrice: 500 }],
      },
    });
    await request('PATCH', `/invoices/${inv.body?.id}/status`, { token, body: { status: 'ISSUED' } });
    const pay = await request('POST', `/invoices/${inv.body?.id}/payment`, { token, body: {} });
    const providerPaymentId = `pay_sec_${pay.body?.paymentId?.replace(/-/g, '')}`;
    const amountPaise = Math.round(Number(pay.body?.amount) * 100);
    const raw = JSON.stringify({
      id: `evt_sec_${runId}`,
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: providerPaymentId, amount: amountPaise, currency: 'INR' } },
        payment_link: {
          entity: {
            id: pay.body?.providerPaymentLinkId,
            reference_id: pay.body?.paymentId,
            amount: amountPaise,
            currency: 'INR',
          },
        },
      },
    });
    await request('POST', '/webhooks/razorpay', {
      body: raw,
      headers: { 'x-razorpay-signature': signRazorpayWebhook(raw) },
    });
    return { paymentId: pay.body?.paymentId, providerPaymentId };
  })();

  const overRefund = await request('POST', `/payments/${paid.paymentId}/refund`, {
    token,
    body: { amount: 99999 },
  });
  if (overRefund.status === 400) pass('23 over-refund rejected', '400');
  else fail('23 over-refund rejected', `${overRefund.status}`);

  const claimInv = await request('POST', '/invoices', {
    token,
    body: {
      patientId: surgPat.id,
      items: [{ description: 'Claim cap', quantity: 1, unitPrice: 1000 }],
    },
  });
  await request('PATCH', `/invoices/${claimInv.body?.id}/status`, { token, body: { status: 'ISSUED' } });
  const claim = await request('POST', '/insurance/claims', {
    token,
    body: {
      patientId: surgPat.id,
      policyId: insPolicy.body?.id,
      invoiceId: claimInv.body?.id,
    },
  });
  await request('POST', `/insurance/claims/${claim.body?.id}/submit`, { token });
  await request('POST', `/insurance/claims/${claim.body?.id}/review`, { token });
  const overClaim = await request('POST', `/insurance/claims/${claim.body?.id}/approve`, {
    token,
    body: { approvedAmount: 50000, patientResponsibility: 0 },
  });
  if (overClaim.status === 400) pass('24 over-claim rejected', '400');
  else fail('24 over-claim rejected', `${overClaim.status}`);

  const gstManip = await request('POST', '/invoices', {
    token,
    body: {
      patientId: patient.id,
      placeOfSupplyStateCode: '36',
      items: [
        {
          description: 'GST item',
          quantity: 1,
          unitPrice: 100,
          gstRate: 99,
          hsnSac: '3004',
          cgstAmount: 0,
          igstAmount: 9999,
        },
      ],
    },
  });
  const gstOk =
    gstManip.status === 400 ||
    (gstManip.status < 300 &&
      Number(gstManip.body?.igstAmount || 0) < 500 &&
      Number(gstManip.body?.totalAmount || 0) < 500);
  if (gstOk) pass('25 GST/tax manipulation blocked or server-recalculated');
  else fail('25 GST/tax manipulation', `${gstManip.status} total=${gstManip.body?.totalAmount}`);

  // --- Concurrency ---
  const concDoctor = doctor.body?.id;
  const slotA = {
    patientId: patient.id,
    branchId: branch.id,
    startAt: '2032-07-01T10:00:00.000Z',
    endAt: '2032-07-01T10:30:00.000Z',
    resourceIds: [concDoctor],
  };
  const slotB = { ...slotA, startAt: '2032-07-01T10:15:00.000Z', endAt: '2032-07-01T10:45:00.000Z' };
  const [apptA, apptB] = await Promise.all([
    request('POST', '/appointments', { token, body: slotA }),
    request('POST', '/appointments', { token, body: slotB }),
  ]);
  const apptSuccess = [apptA, apptB].filter((r) => r.status === 201 || r.status === 200).length;
  const apptConflict = [apptA, apptB].filter((r) => r.status === 409).length;
  if (apptSuccess === 1 && apptConflict === 1) pass('26 concurrent appointment conflict', '1/409');
  else fail('26 concurrent appointment conflict', `${apptA.status}/${apptB.status}`);

  const concBed = await request('POST', '/ipd/beds', {
    token,
    body: {
      branchId: branch.id,
      wardName: 'W1',
      roomNumber: '101',
      bedNumber: `B1-${uniqueSuffix}`,
    },
  });
  const ipdPat1 = await createPatient(token, 'I1');
  const ipdPat2 = await createPatient(token, 'I2');
  const admA = await request('POST', '/ipd/admissions', {
    token,
    body: { patientId: ipdPat1.id, branchId: branch.id, reason: 'A' },
  });
  const admB = await request('POST', '/ipd/admissions', {
    token,
    body: { patientId: ipdPat2.id, branchId: branch.id, reason: 'B' },
  });
  const [allocA, allocB] = await Promise.all([
    request('POST', `/ipd/admissions/${admA.body?.id}/bed`, {
      token,
      body: { bedId: concBed.body?.id },
    }),
    request('POST', `/ipd/admissions/${admB.body?.id}/bed`, {
      token,
      body: { bedId: concBed.body?.id },
    }),
  ]);
  const allocStatuses = [allocA.status, allocB.status];
  const oneSuccess = allocStatuses.filter((s) => s === 201 || s === 200).length === 1;
  const oneConflict = allocStatuses.includes(409);
  if (oneSuccess && oneConflict) {
    pass('27 concurrent IPD bed allocation', `${allocA.status}/${allocB.status}`);
  } else {
    fail('27 concurrent IPD bed allocation', `${allocA.status}/${allocB.status}`);
  }

  const concRxPat = await createPatient(token, 'CRx');
  const concEnc = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId: concRxPat.id, encounterType: 'EMERGENCY' },
  });
  const concRx = await request('POST', `/clinical/encounters/${concEnc.body?.id}/prescriptions`, {
    token,
    body: { items: [{ medicationName: 'Conc', quantity: 4 }] },
  });
  const concBatch = await request('POST', '/pharmacy/batches', {
    token,
    body: {
      productId: product.body?.id,
      batchNumber: `CONC-${uniqueSuffix}`,
      expiryDate: futureDate(120),
      quantity: 2,
      sellingPrice: 5,
    },
  });
  const dispBody = {
    patientId: concRxPat.id,
    prescriptionId: concRx.body?.id,
    items: [
      {
        prescriptionItemId: concRx.body?.items?.[0]?.id,
        productId: product.body?.id,
        batchId: concBatch.body?.id,
        quantity: 2,
      },
    ],
  };
  const [dA, dB] = await Promise.all([
    request('POST', '/pharmacy/dispensings', { token, body: dispBody }),
    request('POST', '/pharmacy/dispensings', { token, body: dispBody }),
  ]);
  const dispSuccess = [dA, dB].filter((r) => r.status === 201 || r.status === 200).length;
  const dispConflict = [dA, dB].filter((r) => r.status === 409).length;
  if (dispSuccess === 1 && dispConflict === 1) {
    pass('28 concurrent pharmacy dispensing', `${dA.status}/${dB.status}`);
  } else {
    fail('28 concurrent pharmacy dispensing', `${dA.status}/${dB.status}`);
  }

  const [invA, invB, invC] = await Promise.all([
    request('POST', '/invoices', {
      token,
      body: { patientId: patient.id, items: [{ description: 'N1', quantity: 1, unitPrice: 10 }] },
    }),
    request('POST', '/invoices', {
      token,
      body: { patientId: patient.id, items: [{ description: 'N2', quantity: 1, unitPrice: 10 }] },
    }),
    request('POST', '/invoices', {
      token,
      body: { patientId: patient.id, items: [{ description: 'N3', quantity: 1, unitPrice: 10 }] },
    }),
  ]);
  const nums = [invA.body?.invoiceNumber, invB.body?.invoiceNumber, invC.body?.invoiceNumber].filter(Boolean);
  if (nums.length === 3 && new Set(nums).size === 3) pass('29 concurrent invoice numbering unique', nums.join(','));
  else fail('29 concurrent invoice numbering', nums.join(','));

  // --- Patient identity ---
  const phoneBase = `989${`${Date.now()}`.slice(-7)}`;
  const variants = [
    phoneBase,
    `+91${phoneBase}`,
    `+91 ${phoneBase.slice(0, 5)} ${phoneBase.slice(5)}`,
    `+91-${phoneBase.slice(0, 5)}-${phoneBase.slice(5)}`,
    `0${phoneBase}`,
  ];
  const first = await request('POST', '/patients', {
    token,
    body: {
      phone: variants[0],
      firstName: 'Canon',
      lastName: 'One',
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  const dup = await request('POST', '/patients', {
    token,
    body: { phone: variants[2], firstName: 'Canon', lastName: 'Two' },
  });
  if (first.body?.phone === `+91${phoneBase}` && dup.status === 409) {
    pass('30 canonical phone duplicate rejected', '409');
  } else {
    fail('30 canonical phone duplicate', `${first.body?.phone}/${dup.status}`);
  }

  const crossPhonePat = await request('POST', '/patients', {
    token: otherToken,
    body: {
      phone: variants[1],
      firstName: 'Cross',
      lastName: 'Hospital',
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'FEMALE',
    },
  });
  if (crossPhonePat.status === 201 || crossPhonePat.status === 200) {
    pass('31 cross-hospital same phone allowed', crossPhonePat.body?.phone);
  } else {
    fail('31 cross-hospital same phone allowed', `${crossPhonePat.status}`);
  }

  const waPat = await createPatient(token, 'WA');
  const waLookup = await prisma.patient.findMany({
    where: { hospitalId, phone: waPat.phone },
  });
  if (waLookup.length === 1) pass('32 WhatsApp/patient single canonical resolution', waPat.phone);
  else fail('32 WhatsApp/patient resolution', `count=${waLookup.length}`);

  // --- Webhooks ---
  const dupEventId = `evt_dup_sec_${runId}`;
  const dupPayload = {
    id: dupEventId,
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: paid.providerPaymentId, amount: 50000, currency: 'INR' } },
      payment_link: {
        entity: {
          id: 'plink_mock_dup',
          reference_id: paid.paymentId,
          amount: 50000,
          currency: 'INR',
        },
      },
    },
  };
  const dupRaw = JSON.stringify(dupPayload);
  const dup1 = await request('POST', '/webhooks/razorpay', {
    body: dupRaw,
    headers: { 'x-razorpay-signature': signRazorpayWebhook(dupRaw) },
  });
  const dup2 = await request('POST', '/webhooks/razorpay', {
    body: dupRaw,
    headers: { 'x-razorpay-signature': signRazorpayWebhook(dupRaw) },
  });
  if ([200, 201].includes(dup1.status) && [200, 201].includes(dup2.status)) {
    pass('33 duplicate Razorpay webhook idempotent', `${dup1.status}/${dup2.status}`);
  } else {
    fail('33 duplicate Razorpay webhook', `${dup1.status}/${dup2.status}`);
  }

  const badSig = await request('POST', '/webhooks/razorpay', {
    body: dupRaw,
    headers: { 'x-razorpay-signature': 'bad-signature' },
  });
  if (badSig.status === 401) pass('35 invalid Razorpay webhook signature', '401');
  else fail('35 invalid Razorpay webhook signature', `${badSig.status}`);

  const waEventId = `wamid.sec.${runId}`;
  const waPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'test_whatsapp_phone_number_id' },
              messages: [
                {
                  id: waEventId,
                  from: waPat.phone.replace('+', ''),
                  timestamp: `${Math.floor(Date.now() / 1000)}`,
                  type: 'text',
                  text: { body: 'Security test inbound' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const waRaw = JSON.stringify(waPayload);
  const wa1 = await request('POST', '/webhooks/whatsapp', {
    body: waRaw,
    headers: { 'x-hub-signature-256': signWhatsAppWebhook(waRaw) },
  });
  const wa2 = await request('POST', '/webhooks/whatsapp', {
    body: waRaw,
    headers: { 'x-hub-signature-256': signWhatsAppWebhook(waRaw) },
  });
  const waInboundCount = await prisma.whatsAppMessage.count({
    where: { providerMessageId: waEventId },
  });
  if ((wa1.status === 200 || wa1.status === 201) && waInboundCount === 1) {
    pass('34 duplicate WhatsApp webhook idempotent', `messages=${waInboundCount}`);
  } else {
    fail('34 duplicate WhatsApp webhook', `${wa1.status}/${wa2.status} count=${waInboundCount}`);
  }

  // --- Audit ---
  const recentAudits = await prisma.auditLog.findMany({
    where: { hospitalId, createdAt: { gte: new Date(Date.now() - 120000) } },
    take: 50,
    orderBy: { createdAt: 'desc' },
  });
  const hasPatientAudit = recentAudits.some((a) => a.action.includes('PATIENT'));
  const hasInvoiceAudit = recentAudits.some((a) => a.action.includes('INVOICE'));
  if (hasPatientAudit && hasInvoiceAudit) pass('36 sensitive operations audited');
  else fail('36 sensitive operations audited', `patient=${hasPatientAudit} invoice=${hasInvoiceAudit}`);

  const auditBlob = JSON.stringify(recentAudits.map((a) => a.metadata));
  const forbidden = ['password', 'secret', 'accessToken', 'cvv', 'subjective', 'objective'];
  const leaked = forbidden.filter((k) => auditBlob.toLowerCase().includes(k.toLowerCase()));
  if (leaked.length === 0) pass('37 secrets/clinical payloads absent from audit metadata');
  else fail('37 audit metadata leak', leaked.join(','));

  // cleanup other hospital
  await prisma.whatsAppConversation.deleteMany({ where: { hospitalId: other.hospital.id } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { hospitalId: other.hospital.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: other.hospital.id } }).catch(() => {});

  await prisma.$disconnect();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
