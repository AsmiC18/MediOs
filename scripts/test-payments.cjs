const { loginBody } = require('./lib/login-body.cjs');
const { ensureAdminPhase1Permissions } = require('./lib/ensure-admin-permissions.cjs');
const crypto = require('crypto');
const path = require('path');

const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma/client'));

const BASE = 'http://localhost:3000';
const WEBHOOK_SECRET = 'test_webhook_secret_day3';
const DEMO_HOSPITAL_ID = 'af0abe33-e9d0-4d06-a3fe-ce23a5ccde71';
const VALID_GSTIN = '36AABCU9603R1Z5';
const results = [];
const runId = Date.now().toString(36);

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS: ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(method, path, { token, body, headers } = {}) {
  const h = { ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
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
  return { status: res.status, body: json };
}

function signWebhook(rawBody) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

async function webhookPost(rawBody) {
  const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  return request('POST', '/webhooks/razorpay', {
    body: bodyStr,
    headers: { 'x-razorpay-signature': signWebhook(bodyStr) },
  });
}

async function main() {
  const prisma = new PrismaClient();

  const login = await request('POST', '/auth/login', {
    body: loginBody('admin@test.com'),
  });
  const token = login.body?.accessToken;
  if (!token) {
    fail('login');
    process.exit(1);
  }
  pass('login');

  await ensureAdminPhase1Permissions(prisma, login.body.user.roleId);

  const patients = await request('GET', '/patients?limit=1', { token });
  const patientId = patients.body?.data?.[0]?.id;

  const draft = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Draft pay test', quantity: 1, unitPrice: 100 }] },
  });
  const draftId = draft.body?.id;

  const draftPay = await request('POST', `/invoices/${draftId}/payment`, { token, body: {} });
  if (draftPay.status === 400) pass('1 DRAFT payment blocked', '400');
  else fail('1 DRAFT payment blocked', `${draftPay.status}`);

  const issuedInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Issued pay', quantity: 1, unitPrice: 1180 }] },
  });
  const issuedId = issuedInv.body?.id;
  await request('PATCH', `/invoices/${issuedId}/status`, { token, body: { status: 'ISSUED' } });

  const pay1 = await request('POST', `/invoices/${issuedId}/payment`, { token, body: {} });
  if (pay1.status === 201 || pay1.status === 200) {
    pass('2 ISSUED payment created', pay1.status);
    if (Number(pay1.body.amount) === 1180) pass('3 amount from invoice', pay1.body.amount);
    else fail('3 amount from invoice', pay1.body.amount);
    if (pay1.body.providerPaymentLinkId) pass('10 providerPaymentLinkId stored', pay1.body.providerPaymentLinkId);
    else fail('10 providerPaymentLinkId stored');
  } else fail('2 ISSUED payment', `${pay1.status} ${JSON.stringify(pay1.body)}`);

  const badAmount = await request('POST', `/invoices/${issuedId}/payment`, {
    token,
    body: { amount: 1 },
  });
  if (badAmount.status === 400) pass('4 client amount rejected', '400');
  else fail('4 client amount rejected', `${badAmount.status}`);

  const badHospital = await request('POST', `/invoices/${issuedId}/payment`, {
    token,
    body: { hospitalId: DEMO_HOSPITAL_ID },
  });
  if (badHospital.status === 400) pass('5 client hospitalId rejected', '400');
  else fail('5 client hospitalId rejected', `${badHospital.status}`);

  const badCurrency = await request('POST', `/invoices/${issuedId}/payment`, {
    token,
    body: { currency: 'USD' },
  });
  if (badCurrency.status === 400) pass('6 client currency rejected', '400');
  else fail('6 client currency rejected', `${badCurrency.status}`);

  const pendingDup = await request('POST', `/invoices/${issuedId}/payment`, { token, body: {} });
  if (pendingDup.status === 409) pass('22 second PENDING blocked', '409');
  else fail('22 second PENDING blocked', `${pendingDup.status}`);

  const paymentId = pay1.body.paymentId;
  const paymentRow = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (paymentRow && paymentRow.hospitalId === DEMO_HOSPITAL_ID && paymentRow.invoiceId === issuedId) {
    pass('9 payment row fields', paymentRow.status);
  } else fail('9 payment row fields');

  const successPayload = {
    id: `evt_success_${runId}`,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_test_success_${runId}`,
          amount: 118000,
          currency: 'INR',
          order_id: 'order_test_1',
        },
      },
      payment_link: {
        entity: {
          id: pay1.body.providerPaymentLinkId,
          reference_id: paymentId,
          amount: 118000,
          currency: 'INR',
        },
      },
    },
  };
  const whOk = await webhookPost(successPayload);
  if (whOk.status === 201 || whOk.status === 200) pass('11 valid webhook accepted', whOk.status);
  else fail('11 valid webhook', `${whOk.status} ${JSON.stringify(whOk.body)}`);

  const paidInv = await request('GET', `/invoices/${issuedId}`, { token });
  if (paidInv.body.status === 'PAID') pass('14 invoice PAID via webhook', paidInv.body.status);
  else fail('14 invoice PAID via webhook', paidInv.body.status);

  const paidPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (paidPayment?.status === 'SUCCEEDED') pass('13 payment SUCCEEDED', paidPayment.status);
  else fail('13 payment SUCCEEDED', paidPayment?.status);

  const dupWh = await webhookPost(successPayload);
  if (dupWh.status === 201 || dupWh.status === 200) pass('17 duplicate webhook idempotent', '200');
  else fail('17 duplicate webhook', `${dupWh.status}`);

  const badSigBody = JSON.stringify(successPayload);
  const badSig = await request('POST', '/webhooks/razorpay', {
    body: badSigBody,
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'invalid' },
  });
  if (badSig.status === 401 || badSig.status === 400) pass('12 invalid signature rejected', badSig.status);
  else fail('12 invalid signature', `${badSig.status}`);

  const paidInv2 = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Already paid', quantity: 1, unitPrice: 50 }] },
  });
  const paidInv2Id = paidInv2.body.id;
  await request('PATCH', `/invoices/${paidInv2Id}/status`, { token, body: { status: 'ISSUED' } });
  await request('PATCH', `/invoices/${paidInv2Id}/status`, { token, body: { status: 'PAID' } });
  const paidBlock = await request('POST', `/invoices/${paidInv2Id}/payment`, { token, body: {} });
  if (paidBlock.status === 409) pass('7 PAID invoice blocked', '409');
  else fail('7 PAID invoice blocked', `${paidBlock.status}`);

  const cancelInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Cancelled', quantity: 1, unitPrice: 50 }] },
  });
  const cancelInvId = cancelInv.body.id;
  await request('PATCH', `/invoices/${cancelInvId}/status`, { token, body: { status: 'CANCELLED' } });
  const cancelBlock = await request('POST', `/invoices/${cancelInvId}/payment`, { token, body: {} });
  if (cancelBlock.status === 400) pass('8 CANCELLED invoice blocked', '400');
  else fail('8 CANCELLED invoice blocked', `${cancelBlock.status}`);

  const failInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Fail flow', quantity: 1, unitPrice: 200 }] },
  });
  const failInvId = failInv.body.id;
  await request('PATCH', `/invoices/${failInvId}/status`, { token, body: { status: 'ISSUED' } });
  const failPay = await request('POST', `/invoices/${failInvId}/payment`, { token, body: {} });
  const failPaymentId = failPay.body.paymentId;
  const failPayload = {
    id: `evt_fail_${runId}`,
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: `pay_test_fail_${runId}`,
          amount: 20000,
          currency: 'INR',
          error_description: 'Payment declined',
        },
      },
      payment_link: {
        entity: {
          id: failPay.body.providerPaymentLinkId,
          reference_id: failPaymentId,
        },
      },
    },
  };
  await webhookPost(failPayload);
  const failInvCheck = await request('GET', `/invoices/${failInvId}`, { token });
  const failPayRow = await prisma.payment.findUnique({ where: { id: failPaymentId } });
  if (failPayRow?.status === 'FAILED' && failInvCheck.body.status === 'ISSUED') {
    pass('15-16 failed webhook', failPayRow.status);
  } else fail('15-16 failed webhook', `${failPayRow?.status}/${failInvCheck.body.status}`);

  const retryPay = await request('POST', `/invoices/${failInvId}/payment`, { token, body: {} });
  if (retryPay.status === 201 || retryPay.status === 200) pass('23 retry after FAILED allowed', retryPay.status);
  else fail('23 retry after FAILED', `${retryPay.status}`);

  const cancelPayInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Cancel pay retry', quantity: 1, unitPrice: 150 }] },
  });
  const cancelPayInvId = cancelPayInv.body.id;
  await request('PATCH', `/invoices/${cancelPayInvId}/status`, { token, body: { status: 'ISSUED' } });
  const cancelPayInit = await request('POST', `/invoices/${cancelPayInvId}/payment`, { token, body: {} });
  const cancelPayId = cancelPayInit.body.paymentId;
  await prisma.payment.update({
    where: { id: cancelPayId },
    data: { status: 'CANCELLED' },
  });
  const retryAfterCancel = await request('POST', `/invoices/${cancelPayInvId}/payment`, { token, body: {} });
  if (retryAfterCancel.status === 201 || retryAfterCancel.status === 200) {
    pass('24 retry after CANCELLED allowed', retryAfterCancel.status);
  } else fail('24 retry after CANCELLED', `${retryAfterCancel.status}`);

  const mismatchPayload = {
    id: `evt_mismatch_${runId}`,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_test_mismatch_${runId}`,
          amount: 99900,
          currency: 'INR',
        },
      },
      payment_link: {
        entity: {
          id: retryPay.body.providerPaymentLinkId,
          reference_id: retryPay.body.paymentId,
          amount: 99900,
          currency: 'INR',
        },
      },
    },
  };
  await webhookPost(mismatchPayload);
  const mismatchInv = await request('GET', `/invoices/${failInvId}`, { token });
  if (mismatchInv.body.status === 'ISSUED') pass('21 amount mismatch not PAID', mismatchInv.body.status);
  else fail('21 amount mismatch', mismatchInv.body.status);

  const crossPay = await request('GET', '/payments/00000000-0000-4000-8000-000000000099', { token });
  if (crossPay.status === 404) pass('18 cross-hospital payment 404', '404');
  else fail('18 cross-hospital payment', `${crossPay.status}`);

  const manualInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Manual paid', quantity: 1, unitPrice: 75 }] },
  });
  const manualId = manualInv.body.id;
  await request('PATCH', `/invoices/${manualId}/status`, { token, body: { status: 'ISSUED' } });
  const manualPaid = await request('PATCH', `/invoices/${manualId}/status`, { token, body: { status: 'PAID' } });
  if (manualPaid.status === 200 && manualPaid.body.status === 'PAID') pass('25 manual PAID still works', manualPaid.body.status);
  else fail('25 manual PAID', `${manualPaid.status}`);

  const audit = await prisma.auditLog.findFirst({
    where: { action: 'PAYMENT_INITIATED', entityId: paymentId },
  });
  if (audit) pass('19 audit PAYMENT_INITIATED', audit.action);
  else fail('19 audit');

  const zeroGst = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Regress zero', quantity: 2, unitPrice: 500 }] },
  });
  if (zeroGst.status === 201 || zeroGst.status === 200) pass('20 Day1 zero-GST regression create', zeroGst.body.invoiceNumber);
  else fail('20 Day1 regression', `${zeroGst.status}`);

  await prisma.hospital.update({
    where: { id: DEMO_HOSPITAL_ID },
    data: { gstin: VALID_GSTIN, stateCode: '36' },
  });
  const gstInv = await request('POST', '/invoices', {
    token,
    body: {
      patientId,
      placeOfSupplyStateCode: '36',
      items: [{ description: 'GST regression', quantity: 1, unitPrice: 1000, gstRate: 18, hsnSac: '998311' }],
    },
  });
  if (
    (gstInv.status === 201 || gstInv.status === 200) &&
    Number(gstInv.body.cgstAmount) === 90 &&
    Number(gstInv.body.sgstAmount) === 90 &&
    Number(gstInv.body.totalAmount) === 1180
  ) {
    pass('20b Day2 GST regression intra-state', gstInv.body.totalAmount);
  } else {
    fail('20b Day2 GST regression', `${gstInv.status} ${JSON.stringify(gstInv.body)}`);
  }

  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- Summary: ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length) {
    console.log('Failures:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
