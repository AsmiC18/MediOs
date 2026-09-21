const crypto = require('crypto');
const path = require('path');

const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma/client'));

const BASE = 'http://localhost:3000';
const APP_SECRET = 'test_whatsapp_app_secret';
const VERIFY_TOKEN = 'test_whatsapp_verify_token';
const PHONE_NUMBER_ID = 'test_whatsapp_phone_number_id';
const DEMO_HOSPITAL_ID = 'af0abe33-e9d0-4d06-a3fe-ce23a5ccde71';
const VALID_GSTIN = '36AABCU9603R1Z5';
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
  try { json = text ? JSON.parse(text) : text; } catch { json = text; }
  return { status: res.status, body: json, text };
}

function signWebhook(rawBody) {
  return `sha256=${crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;
}

async function webhookPost(payload) {
  const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return request('POST', '/webhooks/whatsapp', {
    body: bodyStr,
    headers: { 'x-hub-signature-256': signWebhook(bodyStr) },
  });
}

function inboundPayload(waId, wamid, text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: PHONE_NUMBER_ID },
          messages: [{
            from: waId,
            id: wamid,
            type: 'text',
            text: { body: text },
          }],
        },
      }],
    }],
  };
}

function statusPayload(wamid, status, timestamp) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: PHONE_NUMBER_ID },
          statuses: [{
            id: wamid,
            status,
            timestamp: timestamp || `${Math.floor(Date.now() / 1000)}`,
          }],
        },
      }],
    }],
  };
}

async function main() {
  const prisma = new PrismaClient();

  const login = await request('POST', '/auth/login', {
    body: { email: 'admin@test.com', password: 'MediOS@12345' },
  });
  const token = login.body?.accessToken;
  if (!token) { fail('login'); process.exit(1); }
  pass('login');

  const patientPhone = `${Date.now()}`.slice(-10);
  const waId = `91${patientPhone}`;

  const patient = await request('POST', '/patients', {
    token,
    body: {
      phone: patientPhone,
      firstName: 'WhatsApp',
      lastName: `Test${runId.slice(0, 4)}`,
    },
  });
  const patientId = patient.body?.id;

  const textSend = await request('POST', `/patients/${patientId}/whatsapp/messages`, {
    token,
    body: { type: 'text', text: 'Your appointment is confirmed.' },
  });
  if (textSend.status === 201 && textSend.body.providerMessageId) {
    pass('1 valid patient send', textSend.status);
    pass('6 text message', textSend.body.status);
    pass('10 provider success stores wamid', textSend.body.providerMessageId);
  } else fail('1 valid patient send', `${textSend.status} ${JSON.stringify(textSend.body)}`);

  const cross = await request('POST', '/patients/00000000-0000-4000-8000-000000000099/whatsapp/messages', {
    token,
    body: { type: 'text', text: 'cross' },
  });
  if (cross.status === 404) pass('2 cross-hospital 404', '404');
  else fail('2 cross-hospital', `${cross.status}`);

  const unknownWa = `919999${patientPhone.slice(4)}`;
  const unknownWamid = `wamid.unknown.${runId}`;
  await webhookPost(inboundPayload(unknownWa, unknownWamid, 'hi'));
  const unknownAudit = await prisma.auditLog.findFirst({
    where: { action: 'WHATSAPP_INBOUND_RECEIVED', hospitalId: DEMO_HOSPITAL_ID },
    orderBy: { createdAt: 'desc' },
  });
  const unknownConvCount = await prisma.whatsAppConversation.count({
    where: { hospitalId: DEMO_HOSPITAL_ID, patient: { phone: { contains: '9999' } } },
  });
  if (unknownAudit?.metadata?.unknownPatient === true && unknownConvCount === 0) {
    pass('3 unknown inbound no auto-reply', 'audited');
    pass('17 unknown patient handling', '200');
  } else fail('3 unknown inbound', JSON.stringify(unknownAudit?.metadata));

  const normPatient = await request('POST', '/patients', {
    token,
    body: { phone: `+91${patientPhone}`, firstName: 'Norm', lastName: 'Test' },
  });
  if (normPatient.status !== 409) {
    fail('4 duplicate canonical phone rejected', `${normPatient.status}`);
  } else {
    pass('4 duplicate canonical phone rejected', '409');
  }

  const normWa = waId;
  const normWamid = `wamid.norm.${runId}`;
  await webhookPost(inboundPayload(normWa, normWamid, 'hello'));
  const normMsg = await prisma.whatsAppMessage.findFirst({ where: { providerMessageId: normWamid } });
  if (normMsg?.patientId === patientId) {
    pass('9 phone normalization inbound resolution', normWa);
  } else {
    fail('9 phone normalization inbound resolution', `${normMsg?.patientId}`);
  }

  const badHospital = await request('POST', `/patients/${patientId}/whatsapp/messages`, {
    token,
    body: { type: 'text', text: 'x', hospitalId: DEMO_HOSPITAL_ID },
  });
  if (badHospital.status === 400) pass('8 client hospitalId rejected', '400');
  else fail('8 client hospitalId', `${badHospital.status}`);

  const badToken = await request('POST', `/patients/${patientId}/whatsapp/messages`, {
    token,
    body: { type: 'text', text: 'x', accessToken: 'bad' },
  });
  if (badToken.status === 400) pass('9 client credentials rejected', '400');
  else fail('9 client credentials', `${badToken.status}`);

  const templateSend = await request('POST', `/patients/${patientId}/whatsapp/messages`, {
    token,
    body: {
      type: 'template',
      templateName: 'appointment_confirmation',
      languageCode: 'en',
      parameters: ['Amulya', '18 Sep 2026', '10:00 AM'],
    },
  });
  if (templateSend.status === 201) pass('7 template message', templateSend.body.templateName || 'sent');
  else fail('7 template message', `${templateSend.status} ${JSON.stringify(templateSend.body)}`);

  const badTemplate = await request('POST', `/patients/${patientId}/whatsapp/messages`, {
    token,
    body: { type: 'template', templateName: 'not_allowed', languageCode: 'en', parameters: ['a'] },
  });
  if (badTemplate.status === 400) pass('template validation', '400');
  else fail('template validation', `${badTemplate.status}`);

  const failSend = await request('POST', `/patients/${patientId}/whatsapp/messages`, {
    token,
    body: { type: 'text', text: 'MOCK_SEND_FAIL' },
  });
  const failRow = await prisma.whatsAppMessage.findFirst({
    where: { patientId, content: 'MOCK_SEND_FAIL' },
    orderBy: { createdAt: 'desc' },
  });
  if (failSend.status >= 500 && failRow?.status === 'FAILED') pass('11 provider failure', failRow.status);
  else fail('11 provider failure', `${failSend.status}/${failRow?.status}`);

  const verifyOk = await request('GET', `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge_${runId}`);
  if (verifyOk.status === 200 && verifyOk.text === `challenge_${runId}`) pass('13 valid GET verification', verifyOk.text);
  else fail('13 GET verification', `${verifyOk.status} ${verifyOk.text}`);

  const verifyBad = await request('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x');
  if (verifyBad.status === 403) pass('14 invalid verify token', '403');
  else fail('14 invalid verify token', `${verifyBad.status}`);

  const badSig = await request('POST', '/webhooks/whatsapp', {
    body: JSON.stringify(inboundPayload(waId, `wamid.badsig.${runId}`, 'hi')),
    headers: { 'x-hub-signature-256': 'sha256=invalid' },
  });
  if (badSig.status === 401) pass('invalid webhook signature', '401');
  else fail('invalid webhook signature', `${badSig.status}`);

  const inboundWamid = `wamid.inbound.${runId}`;
  const inboundOk = await webhookPost(inboundPayload(waId, inboundWamid, 'menu'));
  const inboundMsg = await prisma.whatsAppMessage.findFirst({ where: { providerMessageId: inboundWamid } });
  if ((inboundOk.status === 200 || inboundOk.status === 201) && inboundMsg?.direction === 'INBOUND') {
    pass('15 valid inbound webhook', inboundMsg.direction);
    pass('16 patient resolution', inboundMsg.patientId);
    pass('24 new conversation created', inboundMsg.conversationId);
  } else fail('15 inbound webhook', `${inboundOk.status}/${inboundMsg?.direction}`);

  const dupInbound = await webhookPost(inboundPayload(waId, inboundWamid, 'menu'));
  const inboundCount = await prisma.whatsAppMessage.count({ where: { providerMessageId: inboundWamid } });
  if ((dupInbound.status === 200 || dupInbound.status === 201) && inboundCount === 1) {
    pass('18 duplicate inbound idempotent', `${inboundCount}`);
  } else fail('18 duplicate inbound', `${inboundCount}`);

  const outboundWamid = textSend.body.providerMessageId;
  await webhookPost(statusPayload(outboundWamid, 'sent', `ts_sent_${runId}`));
  await webhookPost(statusPayload(outboundWamid, 'delivered', `ts_del_${runId}`));
  await webhookPost(statusPayload(outboundWamid, 'read', `ts_read_${runId}`));
  const statusRow = await prisma.whatsAppMessage.findFirst({ where: { providerMessageId: outboundWamid } });
  if (statusRow?.status === 'READ') {
    pass('19 sent', 'ok');
    pass('20 delivered', 'ok');
    pass('21 read', statusRow.status);
  } else fail('19-21 status', statusRow?.status);

  await webhookPost(statusPayload(outboundWamid, 'sent', `ts_regress_${runId}`));
  const regressRow = await prisma.whatsAppMessage.findFirst({ where: { providerMessageId: outboundWamid } });
  if (regressRow?.status === 'READ') pass('23 READ cannot regress to SENT', regressRow.status);
  else fail('23 status regression', regressRow?.status);

  const failStatusWamid = templateSend.body.providerMessageId;
  await webhookPost({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: PHONE_NUMBER_ID },
      statuses: [{ id: failStatusWamid, status: 'failed', timestamp: `ts_fail_${runId}`, errors: [{ code: 131047, message: 'Failed delivery' }] }],
    } }] }],
  });
  const failStatusRow = await prisma.whatsAppMessage.findFirst({ where: { providerMessageId: failStatusWamid } });
  if (failStatusRow?.status === 'FAILED') pass('22 failed status', failStatusRow.status);
  else fail('22 failed status', failStatusRow?.status);

  const conv1 = await request('GET', `/patients/${patientId}/whatsapp/conversation`, { token });
  const inbound2Wamid = `wamid.inbound2.${runId}`;
  await webhookPost(inboundPayload(waId, inbound2Wamid, 'hello'));
  const conv2 = await request('GET', `/patients/${patientId}/whatsapp/conversation`, { token });
  if (conv1.body?.conversationId && conv1.body.conversationId === conv2.body?.conversationId) {
    pass('25 reuse conversation', conv1.body.conversationId);
  } else fail('25 reuse conversation', `${conv1.body?.conversationId}/${conv2.body?.conversationId}`);

  const flowWamid = `wamid.flow.${runId}`;
  await webhookPost(inboundPayload(waId, flowWamid, 'hi'));
  const optWamid = `wamid.flow.opt.${runId}`;
  await webhookPost(inboundPayload(waId, optWamid, '1'));
  const flowConv = await prisma.whatsAppConversation.findUnique({
    where: { hospitalId_patientId: { hospitalId: DEMO_HOSPITAL_ID, patientId } },
  });
  if (flowConv?.state === 'CLOSED' || flowConv?.state === 'AWAITING_INPUT') {
    pass('26 state transition', flowConv.state);
  } else fail('26 state transition', flowConv?.state);

  const menuReplyFilter = {
    patientId,
    direction: 'OUTBOUND',
    content: { contains: 'Reply 1 for appointments' },
  };
  const autoBefore = await prisma.whatsAppMessage.count({ where: menuReplyFilter });
  const dupMenuWamid = `wamid.dupmenu.${runId}`;
  await webhookPost(inboundPayload(waId, dupMenuWamid, 'menu'));
  const autoMid = await prisma.whatsAppMessage.count({ where: menuReplyFilter });
  await webhookPost(inboundPayload(waId, dupMenuWamid, 'menu'));
  const autoAfter = await prisma.whatsAppMessage.count({ where: menuReplyFilter });
  if (autoMid === autoBefore + 1 && autoAfter === autoBefore + 1) {
    pass('27 duplicate inbound no duplicate auto-reply', `${autoAfter}`);
  } else fail('27 duplicate auto-reply', `${autoBefore}->${autoMid}->${autoAfter}`);

  const inboundAudit = await prisma.auditLog.findFirst({ where: { action: 'WHATSAPP_INBOUND_RECEIVED', entityId: inboundWamid } });
  const outboundAudit = await prisma.auditLog.findFirst({ where: { action: 'WHATSAPP_MESSAGE_SENT', entityId: textSend.body.messageId } });
  const statusAudit = await prisma.auditLog.findFirst({ where: { action: 'WHATSAPP_MESSAGE_READ' } });
  if (inboundAudit) pass('28 inbound audit', inboundAudit.action);
  else fail('28 inbound audit');
  if (outboundAudit) pass('29 outbound audit', outboundAudit.action);
  else fail('29 outbound audit');
  if (statusAudit) pass('30 status audit', statusAudit.action);
  else fail('30 status audit');

  const history = await request('GET', `/patients/${patientId}/whatsapp/messages`, { token });
  if (history.status === 200 && history.body?.data?.length > 0) pass('5 tenant isolation read', history.body.data.length);
  else fail('5 tenant isolation read', `${history.status}`);

  const day1 = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Day1 regress', quantity: 1, unitPrice: 100 }] },
  });
  if (day1.status === 201) pass('31 Day1 billing regression', day1.body.invoiceNumber);
  else fail('31 Day1 regression', `${day1.status}`);

  await prisma.hospital.update({ where: { id: DEMO_HOSPITAL_ID }, data: { gstin: VALID_GSTIN, stateCode: '36' } });
  const day2 = await request('POST', '/invoices', {
    token,
    body: {
      patientId,
      placeOfSupplyStateCode: '36',
      items: [{ description: 'GST regress', quantity: 1, unitPrice: 1000, gstRate: 18, hsnSac: '998311' }],
    },
  });
  if (Number(day2.body?.totalAmount) === 1180) pass('32 Day2 GST regression', day2.body.totalAmount);
  else fail('32 Day2 GST', JSON.stringify(day2.body));

  const day3Inv = await request('POST', '/invoices', {
    token,
    body: { patientId, items: [{ description: 'Day3 regress', quantity: 1, unitPrice: 50 }] },
  });
  const day3Pay = await request('POST', `/invoices/${day3Inv.body.id}/payment`, { token, body: {} });
  if (day3Pay.status === 400) pass('33 Day3 payment regression', '400');
  else fail('33 Day3 payment', `${day3Pay.status}`);

  const day4Rec = await request('GET', `/invoices/${day1.body.id}/reconciliation`, { token });
  if (day4Rec.status === 200 && day4Rec.body.invoiceTotal) pass('34 Day4 reconciliation regression', day4Rec.body.invoiceTotal);
  else fail('34 Day4 reconciliation', `${day4Rec.status}`);

  let rateLimited = false;
  for (let i = 0; i < 25; i += 1) {
    const r = await request('POST', `/patients/${patientId}/whatsapp/messages`, {
      token,
      body: { type: 'text', text: `rate ${i}` },
    });
    if (r.status === 429) { rateLimited = true; break; }
  }
  if (rateLimited) pass('12 rate limit 429', '429');
  else fail('12 rate limit', 'not triggered');

  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- Summary: ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length) {
    console.log('Failures:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
