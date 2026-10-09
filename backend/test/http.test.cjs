require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { sign } = require('jsonwebtoken');
const { Database } = require('../dist/database');
const { StaffGuard } = require('../dist/auth');
const { InboxController, InboxService, SessionController } = require('../dist/inbox');
const { WebhookController } = require('../dist/webhook');

test('HTTP routes enforce authentication, permissions, validation and tenant scope', async () => {
  process.env.JWT_SECRET = 'http-test-secret-with-more-than-32-characters';
  process.env.JWT_ISSUER = 'http-test'; process.env.JWT_AUDIENCE = 'http-test';
  let lastLookup;
  const db = {
    conversation: { findFirst: async ({where}) => { lastLookup=where; return null; } },
    auditEntry: { create: async () => ({}) },
  };
  class TestModule {}
  Module({ controllers:[InboxController,SessionController,WebhookController], providers:[StaffGuard,InboxService,{provide:Database,useValue:db}] })(TestModule);
  const app = await NestFactory.create(TestModule,{rawBody:true,logger:false});
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  await app.listen(0,'127.0.0.1');
  const base = await app.getUrl();
  const token = sign({hospitalId:'h1',branchId:'b1',permissions:['whatsapp.inbox.view','whatsapp.inbox.reply']}, process.env.JWT_SECRET, {subject:'u1',issuer:'http-test',audience:'http-test',expiresIn:'1m'});
  const headers={Authorization:`Bearer ${token}`};
  try {
    assert.equal((await fetch(`${base}/api/whatsapp/session`)).status,401);
    const session=await fetch(`${base}/api/whatsapp/session`,{headers});
    assert.equal(session.status,200);
    assert.equal((await session.json()).hospitalId,'h1');
    assert.equal((await fetch(`${base}/api/whatsapp/conversations?limit=1000`,{headers})).status,400);
    assert.equal((await fetch(`${base}/api/whatsapp/conversations/foreign-id`,{headers})).status,404);
    assert.deepEqual(lastLookup,{id:'foreign-id',hospitalId:'h1',branchId:'b1'});
    const invalidBody=await fetch(`${base}/api/whatsapp/conversations/c1/messages`,{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':'stable-http-request-key'},body:JSON.stringify({text:'hello',hospitalId:'foreign'})});
    assert.equal(invalidBody.status,400);
    const denied=await fetch(`${base}/api/whatsapp/conversations/c1/status`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({status:'resolved'})});
    assert.equal(denied.status,403);
  } finally { await app.close(); }
});
