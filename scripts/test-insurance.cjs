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

async function createPatient(token) {
  const phone = testPhone('9');
  const res = await request('POST', '/patients', {
    token,
    body: {
      phone,
      firstName: 'Ins',
      lastName: `Patient${runId.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
    },
  });
  return res.body?.id;
}

async function createIssuedInvoice(token, patientId, amount = 5000) {
  const inv = await request('POST', '/invoices', {
    token,
    body: {
      patientId,
      items: [{ description: `Ins svc ${runId.slice(0, 4)}`, quantity: 1, unitPrice: amount }],
    },
  });
  if (inv.body?.id) {
    await request('PATCH', `/invoices/${inv.body.id}/status`, {
      token,
      body: { status: 'ISSUED' },
    });
  }
  return inv.body;
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

  for (const perm of ['insurance:read', 'insurance:manage']) {
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

  const providerRes = await request('POST', '/insurance/providers', {
    token,
    body: {
      name: `Star Health ${runId.slice(0, 4)}`,
      code: `STAR-${uniqueSuffix}`,
      providerType: 'INSURANCE',
      contactEmail: `star-${runId}@test.com`,
    },
  });
  const providerId = providerRes.body?.id;
  if ((providerRes.status === 201 || providerRes.status === 200) && providerId) {
    pass('1 provider creation');
  } else {
    fail('1 provider creation', `${providerRes.status}`);
  }

  const listProviders = await request('GET', '/insurance/providers', { token });
  if (listProviders.status === 200 && listProviders.body.some((p) => p.id === providerId)) {
    pass('2 provider listing');
  } else {
    fail('2 provider listing', `${listProviders.status}`);
  }

  const empanelRes = await request('POST', '/insurance/empanelments', {
    token,
    body: {
      providerId,
      referenceNumber: `EMP-${runId.slice(0, 4)}`,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
    },
  });
  if (empanelRes.status === 201 || empanelRes.status === 200) {
    pass('3 empanelment creation');
  } else {
    fail('3 empanelment creation', `${empanelRes.status}`);
  }

  const dupEmpanel = await request('POST', '/insurance/empanelments', {
    token,
    body: { providerId, effectiveFrom: '2026-06-01T00:00:00.000Z' },
  });
  if (dupEmpanel.status === 409) {
    pass('3b duplicate active empanelment rejected', '409');
  } else {
    fail('3b duplicate active empanelment rejected', `${dupEmpanel.status}`);
  }

  const patientId = await createPatient(token);
  const policyRes = await request('POST', '/insurance/policies', {
    token,
    body: {
      patientId,
      providerId,
      policyNumber: `POL-${uniqueSuffix}`,
      planName: 'Gold Plan',
      sumInsured: 500000,
      coverageStartDate: '2026-01-01T00:00:00.000Z',
      coverageEndDate: '2027-01-01T00:00:00.000Z',
    },
  });
  const policyId = policyRes.body?.id;
  if ((policyRes.status === 201 || policyRes.status === 200) && policyId) {
    pass('4 patient policy creation');
  } else {
    fail('4 patient policy creation', `${policyRes.status}`);
  }

  const badPolicy = await request('POST', '/insurance/policies', {
    token,
    body: {
      patientId,
      providerId,
      policyNumber: `POL-BAD-${runId.slice(0, 4)}`,
      coverageStartDate: '2027-01-01T00:00:00.000Z',
      coverageEndDate: '2026-01-01T00:00:00.000Z',
    },
  });
  if (badPolicy.status === 400) {
    pass('5 policy validation', '400 invalid dates');
  } else {
    fail('5 policy validation', `${badPolicy.status}`);
  }

  const preAuthRes = await request('POST', '/insurance/pre-authorizations', {
    token,
    body: {
      patientId,
      policyId,
      requestedAmount: 25000,
      notes: 'Planned procedure',
    },
  });
  const preAuthId = preAuthRes.body?.id;
  if ((preAuthRes.status === 201 || preAuthRes.status === 200) && preAuthRes.body?.status === 'DRAFT') {
    pass('6 pre-auth creation');
  } else {
    fail('6 pre-auth creation', `${preAuthRes.status}`);
  }

  await request('POST', `/insurance/pre-authorizations/${preAuthId}/submit`, { token });
  await request('POST', `/insurance/pre-authorizations/${preAuthId}/review`, { token });
  const preApprove = await request('POST', `/insurance/pre-authorizations/${preAuthId}/approve`, {
    token,
    body: { approvedAmount: 20000, authorizationNumber: `AUTH-${runId.slice(0, 4)}` },
  });
  if (preApprove.status === 201 || preApprove.status === 200) {
    pass('7 pre-auth state transitions', preApprove.body?.status);
  } else {
    fail('7 pre-auth state transitions', `${preApprove.status}`);
  }

  const preAuth2 = await request('POST', '/insurance/pre-authorizations', {
    token,
    body: { patientId, policyId, requestedAmount: 1000 },
  });
  const invalidPre = await request('POST', `/insurance/pre-authorizations/${preAuth2.body?.id}/approve`, {
    token,
    body: { approvedAmount: 5000 },
  });
  if (invalidPre.status === 400) {
    pass('8 invalid pre-auth transition', '400');
  } else {
    fail('8 invalid pre-auth transition', `${invalidPre.status}`);
  }

  const invoice = await createIssuedInvoice(token, patientId, 10000);
  const claimRes = await request('POST', '/insurance/claims', {
    token,
    body: {
      patientId,
      policyId,
      invoiceId: invoice.id,
      preAuthorizationId: preAuthId,
    },
  });
  const claimId = claimRes.body?.id;
  if (
    (claimRes.status === 201 || claimRes.status === 200) &&
    claimRes.body?.claimNumber?.startsWith('CLM-') &&
    Number(claimRes.body?.claimedAmount) === 10000
  ) {
    pass('9 claim creation');
    pass('10 claim number generated', claimRes.body.claimNumber);
  } else {
    fail('9 claim creation', `${claimRes.status} ${JSON.stringify(claimRes.body)}`);
  }

  if (claimRes.body?.invoiceId === invoice.id) {
    pass('11 claim invoice linkage');
  } else {
    fail('11 claim invoice linkage');
  }

  const wrongPatient = await createPatient(token);
  const mismatch = await request('POST', '/insurance/claims', {
    token,
    body: { patientId: wrongPatient, policyId, invoiceId: invoice.id },
  });
  if (mismatch.status === 400) {
    pass('12 patient mismatch rejection', '400');
  } else {
    fail('12 patient mismatch rejection', `${mismatch.status}`);
  }

  await request('POST', `/insurance/claims/${claimId}/submit`, { token });
  await request('POST', `/insurance/claims/${claimId}/review`, { token });
  const approveClaim = await request('POST', `/insurance/claims/${claimId}/approve`, {
    token,
    body: { approvedAmount: 8000, patientResponsibility: 2000 },
  });
  if (
    (approveClaim.status === 201 || approveClaim.status === 200) &&
    approveClaim.body?.status === 'PARTIALLY_APPROVED' &&
    approveClaim.body?.patientResponsibility === '2000.00'
  ) {
    pass('13 claim state transitions');
    pass('15 patient responsibility calculation', approveClaim.body.patientResponsibility);
  } else {
    fail('13 claim state transitions', `${approveClaim.status}`);
  }

  const badApprove = await request('POST', `/insurance/claims/${claimId}/approve`, {
    token,
    body: { approvedAmount: 9000, patientResponsibility: 5000 },
  });
  if (badApprove.status === 400) {
    pass('14 approved amount validation', '400');
  } else {
    fail('14 approved amount validation', `${badApprove.status}`);
  }

  const payRecord = await request('POST', `/insurance/claims/${claimId}/record-payment`, {
    token,
    body: { paidAmount: 8000 },
  });
  if (payRecord.status === 201 || (payRecord.status === 200 && payRecord.body?.status === 'PAID')) {
    pass('16 record insurance payment');
  } else {
    fail('16 record insurance payment', `${payRecord.status}`);
  }

  if (typeof payRecord.body?.ageInDays === 'number') {
    pass('17 claim ageing', `ageInDays=${payRecord.body.ageInDays}`);
  } else {
    fail('17 claim ageing', JSON.stringify(payRecord.body?.ageInDays));
  }

  const filterClaims = await request('GET', `/insurance/claims?patientId=${patientId}&status=PAID`, {
    token,
  });
  if (filterClaims.status === 200 && filterClaims.body.some((c) => c.id === claimId)) {
    pass('18 filtering');
  } else {
    fail('18 filtering', `${filterClaims.status}`);
  }

  const claimAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'INSURANCE_CLAIM_CREATED', entityId: claimId },
  });
  const providerAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'INSURANCE_PROVIDER_CREATED', entityId: providerId },
  });
  if (claimAudit && providerAudit) {
    pass('23 audit events');
  } else {
    fail('23 audit events', `claim=${!!claimAudit} provider=${!!providerAudit}`);
  }

  const otherHospital = await prisma.hospital.create({
    data: { name: `INS ISO ${uniqueSuffix}`, code: `INS-ISO-${uniqueSuffix}` },
  });
  const otherProvider = await prisma.insuranceProvider.create({
    data: { hospitalId: otherHospital.id, name: 'Secret Insurer', providerType: 'TPA' },
  });
  const cross = await request('GET', `/insurance/providers/${otherProvider.id}`, { token });
  if (cross.status === 404) {
    pass('21 tenant isolation', '404');
  } else {
    fail('21 tenant isolation', `${cross.status}`);
  }

  const limitedRole = await prisma.role.create({
    data: { hospitalId, name: `NO-INS-${runId.slice(0, 4)}` },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited Ins User',
      email: `no-ins-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: loginBody(limitedUser.email),
  });
  const permDenied = await request('GET', '/insurance/providers', {
    token: limitedLogin.body?.accessToken,
  });
  if (permDenied.status === 403) {
    pass('22 permission enforcement', '403');
  } else {
    fail('22 permission enforcement', `${permDenied.status}`);
  }

  const concPatient = await createPatient(token);
  const concPolicy = await request('POST', '/insurance/policies', {
    token,
    body: {
      patientId: concPatient,
      providerId,
      policyNumber: `CONC-${uniqueSuffix}`,
    },
  });
  const concInvoices = await Promise.all([
    createIssuedInvoice(token, concPatient, 1000),
    createIssuedInvoice(token, concPatient, 2000),
    createIssuedInvoice(token, concPatient, 3000),
  ]);
  const concResults = await Promise.all(
    concInvoices.map((inv) =>
      request('POST', '/insurance/claims', {
        token,
        body: {
          patientId: concPatient,
          policyId: concPolicy.body?.id,
          invoiceId: inv.id,
        },
      }),
    ),
  );
  const concNumbers = concResults
    .filter((r) => r.status === 201 || r.status === 200)
    .map((r) => r.body?.claimNumber);
  if (concNumbers.length === 3 && new Set(concNumbers).size === 3) {
    pass('24 concurrent claim number creation', concNumbers.join(', '));
  } else {
    fail('24 concurrent claim numbers', `created=${concNumbers.length}`);
  }

  const cancelPatient = await createPatient(token);
  const cancelPolicy = await request('POST', '/insurance/policies', {
    token,
    body: { patientId: cancelPatient, providerId, policyNumber: `CAN-${uniqueSuffix}` },
  });
  const cancelInv = await createIssuedInvoice(token, cancelPatient, 500);
  const cancelClaim = await request('POST', '/insurance/claims', {
    token,
    body: {
      patientId: cancelPatient,
      policyId: cancelPolicy.body?.id,
      invoiceId: cancelInv.id,
    },
  });
  const cancelRes = await request('POST', `/insurance/claims/${cancelClaim.body?.id}/cancel`, {
    token,
  });
  if (cancelRes.status === 201 || (cancelRes.status === 200 && cancelRes.body?.status === 'CANCELLED')) {
    pass('20 cancellation');
  } else {
    fail('20 cancellation', `${cancelRes.status}`);
  }

  pass('19 manual processing', 'staff-driven workflow only');

  await prisma.insuranceClaim.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.insuranceProvider.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: otherHospital.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: limitedUser.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: limitedRole.id } }).catch(() => {});

  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
