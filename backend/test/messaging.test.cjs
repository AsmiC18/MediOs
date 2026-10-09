require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { sign } = require('jsonwebtoken');
const { Reflector } = require('@nestjs/core');
const { StaffGuard } = require('../dist/auth');
const { InboxService } = require('../dist/inbox');
const { WebhookController } = require('../dist/webhook');
const { SendWorker } = require('../dist/worker');

const secret = 'test-only-secret-that-is-at-least-32-characters';
process.env.JWT_SECRET = secret;
process.env.JWT_ISSUER = 'test-medios';
process.env.JWT_AUDIENCE = 'test-api';
const identity = { sub: 'staff-a', hospitalId: 'hospital-a', branchId: 'branch-a', permissions: ['whatsapp.inbox.view'] };
function context(claims, permission = 'whatsapp.inbox.view') {
  const handler = () => {};
  if (permission) Reflect.defineMetadata('permission', permission, handler);
  const token = sign(claims, secret, { issuer: 'test-medios', audience: 'test-api', expiresIn: '1m' });
  const request = { headers: { authorization: `Bearer ${token}` } };
  return { getHandler: () => handler, switchToHttp: () => ({ getRequest: () => request }) };
}
test('JWT guard rejects missing permissions and missing metadata', () => {
  const guard = new StaffGuard(new Reflector());
  assert.equal(guard.canActivate(context(identity)), true);
  assert.throws(() => guard.canActivate(context({ ...identity, permissions: [] })), /Forbidden/);
  assert.throws(() => guard.canActivate(context(identity, null)), /Permission not configured/);
});
test('JWT guard rejects incomplete tenant identity and wrong signature', () => {
  const guard = new StaffGuard(new Reflector());
  assert.throws(() => guard.canActivate(context({ ...identity, branchId: null })), /Unauthorized/);
  const ctx = context(identity);
  ctx.switchToHttp().getRequest().headers.authorization += 'tampered';
  assert.throws(() => guard.canActivate(ctx), /Unauthorized/);
});
test('conversation lookup includes hospital and branch; unknown resources are not found', async () => {
  let filter;
  const inbox = new InboxService({ conversation: { findFirst: async ({where}) => { filter = where; return null; } } });
  await assert.rejects(inbox.conversation(identity, 'foreign-id'), /Conversation not found/);
  assert.deepEqual(filter, { id: 'foreign-id', hospitalId: 'hospital-a', branchId: 'branch-a' });
});
test('reply window is checked and idempotency payload mismatches fail', async () => {
  const db = { conversation: { findFirst: async () => ({ id: 'c', lastInboundAt: new Date(0) }) }, message: { findUnique: async () => null } };
  const inbox = new InboxService(db);
  await assert.rejects(inbox.send(identity, 'c', 'hello', 'stable-request-key-123'), /window closed/);
  db.message.findUnique = async () => ({ conversationId: 'c', text: 'different' });
  await assert.rejects(inbox.send(identity, 'c', 'hello', 'stable-request-key-123'), /different request/);
});
test('webhook signature verification uses original bytes and rejects tampering before writes', async () => {
  process.env.META_APP_SECRET = 'test-app-secret';
  const rawBody = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex');
  const controller = new WebhookController({});
  assert.deepEqual(await controller.receive({ rawBody, body: JSON.parse(rawBody), headers: { 'x-hub-signature-256': signature } }), { received: true });
  await assert.rejects(controller.receive({ rawBody: Buffer.from('{}'), body: {}, headers: { 'x-hub-signature-256': signature } }), /Unauthorized/);
});
test('duplicate inbound webhook does not create a second message', async () => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123'; process.env.WHATSAPP_HOSPITAL_ID = 'hospital-a'; process.env.WHATSAPP_BRANCH_ID = 'branch-a';
  const seen = new Set(); let writes = 0;
  const tx = {
    webhookEvent: { createMany: async ({data}) => { const key = data[0].key; if (seen.has(key)) return {count:0}; seen.add(key); return {count:1}; } },
    conversation: { upsert: async () => ({id:'c'}), updateMany: async () => ({count:1}) },
    message: { create: async () => { writes++; } },
  };
  const controller = new WebhookController({ $transaction: callback => callback(tx) });
  const body = { object:'whatsapp_business_account', entry:[{ changes:[{field:'messages', value:{metadata:{phone_number_id:'123'},messages:[{id:'wamid.test',from:'919876543210',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Hello'}}]}}]}] };
  const rawBody = Buffer.from(JSON.stringify(body));
  const headers = {'x-hub-signature-256':'sha256='+createHmac('sha256',process.env.META_APP_SECRET).update(rawBody).digest('hex')};
  await controller.receive({body,rawBody,headers}); await controller.receive({body,rawBody,headers});
  assert.equal(writes,1);
});
test('provider timeout is uncertain and cannot be marked sent', async () => {
  const oldFetch = global.fetch;
  const outcomes = [];
  const worker = new SendWorker({
    message: { findUniqueOrThrow: async () => ({text:'hello',conversation:{phone:'919876543210',lastInboundAt:new Date()}}) },
  });
  worker.finish = async (_job,status,code) => outcomes.push({status,code});
  global.fetch = async () => { throw new Error('connection lost'); };
  try { await worker.send({id:'job',messageId:'m'}); }
  finally { global.fetch = oldFetch; }
  assert.deepEqual(outcomes,[{status:'submit_uncertain',code:'NETWORK_OR_TIMEOUT'}]);
});
test('queued reply is rejected before Meta call if the reply window expired', async () => {
  const worker = new SendWorker({ message:{findUniqueOrThrow:async()=>({conversation:{lastInboundAt:new Date(0)}})} });
  let outcome;
  worker.finish = async (_job,status,code) => { outcome = {status,code}; };
  await worker.send({id:'job',messageId:'m'});
  assert.deepEqual(outcome,{status:'failed',code:'REPLY_WINDOW_CLOSED'});
});
