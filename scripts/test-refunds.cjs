const { loginBody } = require('./lib/login-body.cjs');
const { ensureAdminPhase1Permissions } = require('./lib/ensure-admin-permissions.cjs');
const crypto = require('crypto');
const path = require('path');

const { PrismaClient, PaymentStatus } = require(path.join(__dirname, '..', 'node_modules', '@prisma/client'));

const BASE = 'http://localhost:3000';
const WEBHOOK_SECRET = 'test_webhook_secret_day3';
const DEMO_HOSPITAL_ID = 'af0abe33-e9d0-4d06-a3fe-ce23a5ccde71';
const VALID_GSTIN = '36AABCU9603R1Z5';
const results = [];
const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
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

function idem(key) {
  return { 'x-idempotency-key': key };
}

async function createIssuedPaidPayment(token, patientId, unitPrice, suffix = '') {
  const inv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: `Pay ${suffix}`, quantity: 1, unitPrice }] },
  });
  const invoiceId = inv.body.id;
  await request('PATCH', `/invoices/${invoiceId}/status`, { token, body: { status: 'ISSUED' } });
  const pay = await request('POST', `/invoices/${invoiceId}/payment`, { token, body: {} });
  const paymentId = pay.body.paymentId;
  const providerPaymentId = `pay_test_${paymentId.replace(/-/g, '')}`;
  const amountPaise = Math.round(Number(pay.body.amount) * 100);
  await webhookPost({
    id: `evt_pay_${suffix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: providerPaymentId, amount: amountPaise, currency: 'INR' } },
      payment_link: {
        entity: {
          id: pay.body.providerPaymentLinkId,
          reference_id: paymentId,
          amount: amountPaise,
          currency: 'INR',
        },
      },
    },
  });
  return { invoiceId, paymentId, amount: pay.body.amount, providerPaymentId };
}

async function refundWebhook(refund, providerPaymentId, event, amountPaise, eventId) {
  return webhookPost({
    id: eventId,
    event,
    payload: {
      refund: {
        entity: {
          id: refund.body.providerRefundId,
          payment_id: providerPaymentId,
          amount: amountPaise,
          currency: 'INR',
          error_description: event === 'refund.failed' ? 'Refund failed' : undefined,
        },
      },
      payment: { entity: { id: providerPaymentId } },
    },
  });
}

async function main() {
  const prisma = new PrismaClient();

  const login = await request('POST', '/auth/login', {
    body: loginBody('admin@test.com'),
  });
  const token = login.body?.accessToken;
  if (!token) { fail('login'); process.exit(1); }
  pass('login');

  await ensureAdminPhase1Permissions(prisma, login.body.user.roleId);

  const patients = await request('GET', '/patients?limit=1', { token });
  const patientId = patients.body?.data?.[0]?.id;

  const pendingInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Pending pay', quantity: 1, unitPrice: 500 }] },
  });
  await request('PATCH', `/invoices/${pendingInv.body.id}/status`, { token, body: { status: 'ISSUED' } });
  const pendingPay = await request('POST', `/invoices/${pendingInv.body.id}/payment`, { token, body: {} });
  const pendingRefund = await request('POST', `/payments/${pendingPay.body.paymentId}/refund`, {
    token,
    body: { amount: 100 },
    headers: idem('idem-pending-1'),
  });
  if (pendingRefund.status === 400) pass('1 refund non-successful payment rejected', '400');
  else fail('1 refund non-successful payment', `${pendingRefund.status}`);

  const failedInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Failed pay', quantity: 1, unitPrice: 400 }] },
  });
  await request('PATCH', `/invoices/${failedInv.body.id}/status`, { token, body: { status: 'ISSUED' } });
  const failedPayInit = await request('POST', `/invoices/${failedInv.body.id}/payment`, { token, body: {} });
  await prisma.payment.update({ where: { id: failedPayInit.body.paymentId }, data: { status: 'FAILED' } });
  const failedRefund = await request('POST', `/payments/${failedPayInit.body.paymentId}/refund`, {
    token,
    body: { amount: 100 },
    headers: idem('idem-failed-1'),
  });
  if (failedRefund.status === 400) pass('2 refund FAILED payment rejected', '400');
  else fail('2 refund FAILED payment', `${failedRefund.status}`);

  const full = await createIssuedPaidPayment(token, patientId, 1000, 'full');
  const fullRefund = await request('POST', `/payments/${full.paymentId}/refund`, {
    token,
    body: { amount: 1000, reason: 'Full refund test' },
    headers: idem('idem-full-1'),
  });
  if (fullRefund.status === 201 && fullRefund.body.amount === '1000.00') pass('3 full refund created', fullRefund.body.status);
  else fail('3 full refund', `${fullRefund.status} ${JSON.stringify(fullRefund.body)}`);

  const partial = await createIssuedPaidPayment(token, patientId, 1000, 'partial');
  const partialRefund = await request('POST', `/payments/${partial.paymentId}/refund`, {
    token,
    body: { amount: 300, reason: 'Partial refund' },
    headers: idem('idem-partial-1'),
  });
  if (partialRefund.status === 201 && partialRefund.body.amount === '300.00') pass('4 partial refund created', partialRefund.body.amount);
  else fail('4 partial refund', `${partialRefund.status}`);

  const over = await createIssuedPaidPayment(token, patientId, 500, 'over');
  const overRefund = await request('POST', `/payments/${over.paymentId}/refund`, {
    token,
    body: { amount: 600 },
    headers: idem('idem-over-1'),
  });
  if (overRefund.status === 400) pass('5 refund over payment rejected', '400');
  else fail('5 refund over payment', `${overRefund.status}`);

  const multi = await createIssuedPaidPayment(token, patientId, 1000, 'multi');
  const r1 = await request('POST', `/payments/${multi.paymentId}/refund`, {
    token, body: { amount: 300 }, headers: idem('idem-multi-1'),
  });
  await refundWebhook(r1, multi.providerPaymentId, 'refund.processed', 30000, `evt_rf_multi_1_${runId}`);
  const r2 = await request('POST', `/payments/${multi.paymentId}/refund`, {
    token, body: { amount: 400 }, headers: idem('idem-multi-2'),
  });
  if (r1.status === 201 && r2.status === 201) pass('6 multiple partial refunds', '201');
  else fail('6 multiple partial refunds', `${r1.status}/${r2.status}`);

  const remain = await createIssuedPaidPayment(token, patientId, 1000, 'remain');
  const remainRefund = await request('POST', `/payments/${remain.paymentId}/refund`, {
    token, body: { amount: 300 }, headers: idem('idem-remain-1'),
  });
  await refundWebhook(
    remainRefund,
    remain.providerPaymentId,
    'refund.processed',
    30000,
    `evt_rf_remain_1_${Date.now()}`,
  );
  const remainReject = await request('POST', `/payments/${remain.paymentId}/refund`, {
    token, body: { amount: 800 }, headers: idem('idem-remain-2'),
  });
  if (remainReject.status === 400) pass('7 second refund exceeds remaining', '400');
  else fail('7 second refund exceeds remaining', `${remainReject.status}`);

  const zeroPay = await createIssuedPaidPayment(token, patientId, 100, 'zero');
  const zeroRefund = await request('POST', `/payments/${zeroPay.paymentId}/refund`, {
    token, body: { amount: 0 }, headers: idem('idem-zero-1'),
  });
  if (zeroRefund.status === 400) pass('8 zero refund rejected', '400');
  else fail('8 zero refund', `${zeroRefund.status}`);

  const negRefund = await request('POST', `/payments/${zeroPay.paymentId}/refund`, {
    token, body: { amount: -10 }, headers: idem('idem-neg-1'),
  });
  if (negRefund.status === 400) pass('9 negative refund rejected', '400');
  else fail('9 negative refund', `${negRefund.status}`);

  const crossRefund = await request('GET', '/refunds/00000000-0000-4000-8000-000000000099', { token });
  if (crossRefund.status === 404) pass('10 cross-hospital refund 404', '404');
  else fail('10 cross-hospital refund', `${crossRefund.status}`);

  if (partialRefund.body.providerRefundId) pass('11 provider refund id stored', partialRefund.body.providerRefundId);
  else fail('11 provider refund id stored');

  const mockFailPay = await createIssuedPaidPayment(token, patientId, 250, 'mockfail');
  const mockFailRefund = await request('POST', `/payments/${mockFailPay.paymentId}/refund`, {
    token,
    body: { amount: 250, reason: 'MOCK_REFUND_FAIL' },
    headers: idem('idem-mockfail-1'),
  });
  const mockFailRow = await prisma.refund.findFirst({
    where: { paymentId: mockFailPay.paymentId, clientRequestId: 'idem-mockfail-1' },
  });
  if (mockFailRefund.status >= 400 && mockFailRow?.status === 'FAILED') pass('12 provider failure -> FAILED', mockFailRow.status);
  else fail('12 provider failure', `${mockFailRefund.status}/${mockFailRow?.status}`);

  const retryPay = await createIssuedPaidPayment(token, patientId, 500, 'retry');
  await request('POST', `/payments/${retryPay.paymentId}/refund`, {
    token, body: { amount: 200, reason: 'MOCK_REFUND_FAIL' }, headers: idem('idem-retry-fail'),
  });
  const retryRefund = await request('POST', `/payments/${retryPay.paymentId}/refund`, {
    token, body: { amount: 200 }, headers: idem('idem-retry-ok'),
  });
  if (retryRefund.status === 201) pass('13 retry after FAILED refund', retryRefund.status);
  else fail('13 retry after FAILED', `${retryRefund.status}`);

  const idemPay = await createIssuedPaidPayment(token, patientId, 600, 'idem');
  const idem1 = await request('POST', `/payments/${idemPay.paymentId}/refund`, {
    token, body: { amount: 200 }, headers: idem('same-key-14'),
  });
  const idem2 = await request('POST', `/payments/${idemPay.paymentId}/refund`, {
    token, body: { amount: 200 }, headers: idem('same-key-14'),
  });
  const idemCount = await prisma.refund.count({ where: { paymentId: idemPay.paymentId, clientRequestId: 'same-key-14' } });
  if (idem1.body.refundId === idem2.body.refundId && idemCount === 1) pass('14 duplicate idempotency key', idemCount);
  else fail('14 duplicate idempotency key', `${idemCount}`);

  const idemNew = await request('POST', `/payments/${idemPay.paymentId}/refund`, {
    token, body: { amount: 200 }, headers: idem('new-key-15'),
  });
  if (idemNew.status === 201 && idemNew.body.refundId !== idem1.body.refundId) pass('15 new idempotency key new refund', idemNew.body.refundId);
  else fail('15 new idempotency key', `${idemNew.status}`);

  const full2 = await createIssuedPaidPayment(token, patientId, 300, 'full2');
  const fr = await request('POST', `/payments/${full2.paymentId}/refund`, {
    token, body: { amount: 300 }, headers: idem('full2-r1'),
  });
  await refundWebhook(fr, full2.providerPaymentId, 'refund.processed', 30000, `evt_rf_full2_${runId}`);
  const full2Again = await request('POST', `/payments/${full2.paymentId}/refund`, {
    token, body: { amount: 1 }, headers: idem('full2-r2'),
  });
  if (full2Again.status === 400) pass('16 fully refunded cannot refund again', '400');
  else fail('16 fully refunded', `${full2Again.status}`);

  const failBalPay = await createIssuedPaidPayment(token, patientId, 800, 'failbal');
  await request('POST', `/payments/${failBalPay.paymentId}/refund`, {
    token, body: { amount: 300, reason: 'MOCK_REFUND_FAIL' }, headers: idem('failbal-1'),
  });
  const failBalOk = await request('POST', `/payments/${failBalPay.paymentId}/refund`, {
    token, body: { amount: 300 }, headers: idem('failbal-2'),
  });
  if (failBalOk.status === 201) pass('17 failed refunds do not reduce balance', failBalOk.status);
  else fail('17 failed refunds balance', `${failBalOk.status}`);

  const whPay = await createIssuedPaidPayment(token, patientId, 450, 'wh');
  const whRefund = await request('POST', `/payments/${whPay.paymentId}/refund`, {
    token, body: { amount: 450 }, headers: idem('wh-r1'),
  });
  const whOk = await refundWebhook(whRefund, whPay.providerPaymentId, 'refund.processed', 45000, `evt_rf_wh_ok_${runId}`);
  const whRow = await prisma.refund.findUnique({ where: { id: whRefund.body.refundId } });
  if ((whOk.status === 200 || whOk.status === 201) && whRow?.status === 'SUCCEEDED') pass('18 refund.processed webhook', whRow.status);
  else fail('18 refund.processed webhook', `${whOk.status}/${whRow?.status}`);

  const badSig = await request('POST', '/webhooks/razorpay', {
    body: JSON.stringify({ event: 'refund.processed', id: 'bad' }),
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'invalid' },
  });
  if (badSig.status === 401 || badSig.status === 400) pass('19 invalid signature rejected', badSig.status);
  else fail('19 invalid signature', `${badSig.status}`);

  const dupPayload = {
    id: `evt_rf_dup_${runId}`,
    event: 'refund.processed',
    payload: {
      refund: {
        entity: {
          id: whRefund.body.providerRefundId,
          payment_id: whPay.providerPaymentId,
          amount: 45000,
          currency: 'INR',
        },
      },
    },
  };
  const dup1 = await webhookPost(dupPayload);
  const dup2 = await webhookPost(dupPayload);
  if ((dup1.status === 200 || dup1.status === 201) && (dup2.status === 200 || dup2.status === 201)) pass('20 duplicate refund webhook idempotent', '200');
  else fail('20 duplicate refund webhook', `${dup1.status}/${dup2.status}`);

  const mmPay = await createIssuedPaidPayment(token, patientId, 500, 'mm');
  const mmRefund = await request('POST', `/payments/${mmPay.paymentId}/refund`, {
    token, body: { amount: 500 }, headers: idem('mm-r1'),
  });
  await refundWebhook(mmRefund, mmPay.providerPaymentId, 'refund.processed', 99900, `evt_rf_mm_${runId}`);
  const mmRow = await prisma.refund.findUnique({ where: { id: mmRefund.body.refundId } });
  if (mmRow?.status !== 'SUCCEEDED') pass('21 refund amount mismatch rejected', mmRow?.status);
  else fail('21 refund amount mismatch', mmRow?.status);

  const failWhPay = await createIssuedPaidPayment(token, patientId, 350, 'failwh');
  const failWhRefund = await request('POST', `/payments/${failWhPay.paymentId}/refund`, {
    token, body: { amount: 350 }, headers: idem('failwh-r1'),
  });
  await refundWebhook(failWhRefund, failWhPay.providerPaymentId, 'refund.failed', 35000, `evt_rf_failwh_${runId}`);
  const failWhRow = await prisma.refund.findUnique({ where: { id: failWhRefund.body.refundId } });
  if (failWhRow?.status === 'FAILED') pass('22 refund.failed webhook', failWhRow.status);
  else fail('22 refund.failed webhook', failWhRow?.status);

  const payWh = await createIssuedPaidPayment(token, patientId, 220, 'paywh');
  const payWhOk = await webhookPost({
    id: `evt_paywh_ok_${runId}`,
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: payWh.providerPaymentId, amount: 22000, currency: 'INR' } },
      payment_link: {
        entity: {
          id: (await prisma.payment.findUnique({ where: { id: payWh.paymentId } })).providerPaymentLinkId,
          reference_id: payWh.paymentId,
          amount: 22000,
          currency: 'INR',
        },
      },
    },
  });
  if (payWhOk.status === 200 || payWhOk.status === 201) pass('23 existing payment success webhook', payWhOk.status);
  else fail('23 payment success webhook', `${payWhOk.status}`);

  const payFailInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Pay fail wh', quantity: 1, unitPrice: 180 }] },
  });
  await request('PATCH', `/invoices/${payFailInv.body.id}/status`, { token, body: { status: 'ISSUED' } });
  const payFailInit = await request('POST', `/invoices/${payFailInv.body.id}/payment`, { token, body: {} });
  const payFailProviderId = `pay_fail_wh_${payFailInit.body.paymentId.replace(/-/g, '')}`;
  const payFailWh = await webhookPost({
    id: `evt_pay_fail_wh_${runId}`,
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: payFailProviderId,
          amount: 18000,
          currency: 'INR',
          error_description: 'Declined',
        },
      },
      payment_link: {
        entity: {
          id: payFailInit.body.providerPaymentLinkId,
          reference_id: payFailInit.body.paymentId,
        },
      },
    },
  });
  const payFailRow = await prisma.payment.findUnique({ where: { id: payFailInit.body.paymentId } });
  if ((payFailWh.status === 200 || payFailWh.status === 201) && payFailRow?.status === 'FAILED') pass('24 existing payment failed webhook', payFailRow.status);
  else fail('24 payment failed webhook', `${payFailWh.status}/${payFailRow?.status}`);

  const dupPayPayload = {
    id: `evt_paywh_ok_${runId}`,
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: payWh.providerPaymentId, amount: 22000, currency: 'INR' } },
      payment_link: {
        entity: {
          id: (await prisma.payment.findUnique({ where: { id: payWh.paymentId } })).providerPaymentLinkId,
          reference_id: payWh.paymentId,
          amount: 22000,
          currency: 'INR',
        },
      },
    },
  };
  const dupPayWh = await webhookPost(dupPayPayload);
  if (dupPayWh.status === 200 || dupPayWh.status === 201) pass('25 duplicate payment webhook idempotent', dupPayWh.status);
  else fail('25 duplicate payment webhook', `${dupPayWh.status}`);

  const recExact = await createIssuedPaidPayment(token, patientId, 1000, 'rec-exact');
  await refundWebhook(
    await request('POST', `/payments/${recExact.paymentId}/refund`, {
      token, body: { amount: 1000 }, headers: idem('rec-exact-r1'),
    }),
    recExact.providerPaymentId,
    'refund.processed',
    100000,
    `evt_rf_rec_exact_${runId}`,
  );
  const recExactRes = await request('GET', `/invoices/${recExact.invoiceId}/reconciliation`, { token });
  if (recExactRes.body.netCollected === '0.00' && recExactRes.body.outstanding === '0.00') pass('26 exact match reconciliation', recExactRes.body.netCollected);
  else fail('26 exact match', JSON.stringify(recExactRes.body));

  const recPartial = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Rec partial', quantity: 1, unitPrice: 1000 }] },
  });
  await prisma.payment.create({
    data: {
      hospitalId: DEMO_HOSPITAL_ID,
      invoiceId: recPartial.body.id,
      amount: 900,
      currency: 'INR',
      provider: 'RAZORPAY',
      status: 'SUCCEEDED',
      providerPaymentId: `pay_rec_partial_${Date.now()}`,
      paidAt: new Date(),
    },
  });
  const recPartialRes = await request('GET', `/invoices/${recPartial.body.id}/reconciliation`, { token });
  if (recPartialRes.body.outstanding === '100.00' && recPartialRes.body.mismatch === '100.00') pass('27 partial payment reconciliation', recPartialRes.body.outstanding);
  else fail('27 partial payment', JSON.stringify(recPartialRes.body));

  const recFullRef = await createIssuedPaidPayment(token, patientId, 500, 'rec-fullref');
  const recFullRefR = await request('POST', `/payments/${recFullRef.paymentId}/refund`, {
    token, body: { amount: 500 }, headers: idem('rec-fullref-r1'),
  });
  await refundWebhook(recFullRefR, recFullRef.providerPaymentId, 'refund.processed', 50000, `evt_rf_rec_full_${runId}`);
  const recFullRefRes = await request('GET', `/invoices/${recFullRef.invoiceId}/reconciliation`, { token });
  if (recFullRefRes.body.successfulRefunds === '500.00' && recFullRefRes.body.netCollected === '0.00') pass('28 full refund reconciliation', recFullRefRes.body.netCollected);
  else fail('28 full refund recon', JSON.stringify(recFullRefRes.body));

  const recPartRef = await createIssuedPaidPayment(token, patientId, 1000, 'rec-partref');
  const recPartRefR = await request('POST', `/payments/${recPartRef.paymentId}/refund`, {
    token, body: { amount: 300 }, headers: idem('rec-partref-r1'),
  });
  await refundWebhook(recPartRefR, recPartRef.providerPaymentId, 'refund.processed', 30000, `evt_rf_rec_part_${runId}`);
  const recPartRefRes = await request('GET', `/invoices/${recPartRef.invoiceId}/reconciliation`, { token });
  if (recPartRefRes.body.netCollected === '700.00') pass('29 partial refund reconciliation', recPartRefRes.body.netCollected);
  else fail('29 partial refund recon', JSON.stringify(recPartRefRes.body));

  const recMultiInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Rec multi pay', quantity: 1, unitPrice: 1000 }] },
  });
  await prisma.payment.createMany({
    data: [
      {
        hospitalId: DEMO_HOSPITAL_ID,
        invoiceId: recMultiInv.body.id,
        amount: 600,
        currency: 'INR',
        provider: 'RAZORPAY',
        status: 'SUCCEEDED',
        providerPaymentId: `pay_rec_mp1_${Date.now()}`,
        paidAt: new Date(),
      },
      {
        hospitalId: DEMO_HOSPITAL_ID,
        invoiceId: recMultiInv.body.id,
        amount: 400,
        currency: 'INR',
        provider: 'RAZORPAY',
        status: 'SUCCEEDED',
        providerPaymentId: `pay_rec_mp2_${Date.now()}`,
        paidAt: new Date(),
      },
    ],
  });
  const recMultiRes = await request('GET', `/invoices/${recMultiInv.body.id}/reconciliation`, { token });
  if (recMultiRes.body.successfulPayments === '1000.00') pass('30 multiple successful payments', recMultiRes.body.successfulPayments);
  else fail('30 multiple payments', JSON.stringify(recMultiRes.body));

  const recMultiRefInv = await createIssuedPaidPayment(token, patientId, 1000, 'rec-multiref');
  const mrr1 = await request('POST', `/payments/${recMultiRefInv.paymentId}/refund`, {
    token, body: { amount: 200 }, headers: idem('rec-mrr1'),
  });
  await refundWebhook(mrr1, recMultiRefInv.providerPaymentId, 'refund.processed', 20000, `evt_rf_mrr1_${runId}`);
  const mrr2 = await request('POST', `/payments/${recMultiRefInv.paymentId}/refund`, {
    token, body: { amount: 100 }, headers: idem('rec-mrr2'),
  });
  await refundWebhook(mrr2, recMultiRefInv.providerPaymentId, 'refund.processed', 10000, `evt_rf_mrr2_${runId}`);
  const recMultiRefRes = await request('GET', `/invoices/${recMultiRefInv.invoiceId}/reconciliation`, { token });
  if (recMultiRefRes.body.successfulRefunds === '300.00') pass('31 multiple successful refunds', recMultiRefRes.body.successfulRefunds);
  else fail('31 multiple refunds', JSON.stringify(recMultiRefRes.body));

  const recFailRefInv = await createIssuedPaidPayment(token, patientId, 500, 'rec-failref');
  await request('POST', `/payments/${recFailRefInv.paymentId}/refund`, {
    token, body: { amount: 200, reason: 'MOCK_REFUND_FAIL' }, headers: idem('rec-failref-r1'),
  });
  const recFailRefRes = await request('GET', `/invoices/${recFailRefInv.invoiceId}/reconciliation`, { token });
  if (recFailRefRes.body.successfulRefunds === '0.00') pass('32 failed refund excluded', recFailRefRes.body.successfulRefunds);
  else fail('32 failed refund excluded', JSON.stringify(recFailRefRes.body));

  const recFailPayInv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Rec fail pay', quantity: 1, unitPrice: 500 }] },
  });
  await request('PATCH', `/invoices/${recFailPayInv.body.id}/status`, { token, body: { status: 'ISSUED' } });
  const recFailPayInit = await request('POST', `/invoices/${recFailPayInv.body.id}/payment`, { token, body: {} });
  await webhookPost({
    id: `evt_rec_failpay_${runId}`,
    event: 'payment.failed',
    payload: {
      payment: { entity: { id: 'pay_rec_fail', amount: 50000, currency: 'INR', error_description: 'Fail' } },
      payment_link: { entity: { id: recFailPayInit.body.providerPaymentLinkId, reference_id: recFailPayInit.body.paymentId } },
    },
  });
  const recFailPayRes = await request('GET', `/invoices/${recFailPayInv.body.id}/reconciliation`, { token });
  if (recFailPayRes.body.successfulPayments === '0.00') pass('33 failed payment excluded', recFailPayRes.body.successfulPayments);
  else fail('33 failed payment excluded', JSON.stringify(recFailPayRes.body));

  if (recPartRefRes.body.netCollected === '700.00') pass('34 netCollected correct', recPartRefRes.body.netCollected);
  else fail('34 netCollected', recPartRefRes.body.netCollected);
  if (recPartialRes.body.outstanding === '100.00') pass('35 outstanding correct', recPartialRes.body.outstanding);
  else fail('35 outstanding', recPartialRes.body.outstanding);
  if (recPartialRes.body.mismatch === '100.00') pass('36 mismatch correct', recPartialRes.body.mismatch);
  else fail('36 mismatch', recPartialRes.body.mismatch);

  const crossRec = await request('GET', '/invoices/00000000-0000-4000-8000-000000000099/reconciliation', { token });
  if (crossRec.status === 404) pass('37 cross-hospital reconciliation 404', '404');
  else fail('37 cross-hospital reconciliation', `${crossRec.status}`);

  const day1 = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Day1 regress', quantity: 2, unitPrice: 500 }] },
  });
  if (day1.status === 201 || day1.status === 200) pass('38 Day1 billing regression', day1.body.invoiceNumber);
  else fail('38 Day1 regression', `${day1.status}`);

  await prisma.hospital.update({
    where: { id: DEMO_HOSPITAL_ID },
    data: { gstin: VALID_GSTIN, stateCode: '36' },
  });
  const day2 = await request('POST', '/invoices', {
    token,
    body: {
      patientId,
      placeOfSupplyStateCode: '36',
      items: [{ description: 'Day2 GST regress', quantity: 1, unitPrice: 1000, gstRate: 18, hsnSac: '998311' }],
    },
  });
  if (
    (day2.status === 201 || day2.status === 200) &&
    Number(day2.body.cgstAmount) === 90 &&
    Number(day2.body.totalAmount) === 1180
  ) pass('39 Day2 GST regression', day2.body.totalAmount);
  else fail('39 Day2 GST regression', JSON.stringify(day2.body));

  const day3Inv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Day3 regress', quantity: 1, unitPrice: 100 }] },
  });
  const day3DraftPay = await request('POST', `/invoices/${day3Inv.body.id}/payment`, { token, body: {} });
  if (day3DraftPay.status === 400) pass('40 Day3 payment regression DRAFT blocked', '400');
  else fail('40 Day3 regression', `${day3DraftPay.status}`);

  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- Summary: ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length) {
    console.log('Failures:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
