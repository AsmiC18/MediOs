// Offline local-development token creation, never a public auth endpoint.
require('dotenv/config');
const { sign } = require('jsonwebtoken');
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEV_TOKEN !== 'true') {
  throw new Error('Development token generation is disabled. Set ALLOW_DEV_TOKEN=true locally.');
}
for (const name of ['JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE', 'WHATSAPP_HOSPITAL_ID', 'WHATSAPP_BRANCH_ID']) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET is too short');
const token = sign({
  hospitalId: process.env.WHATSAPP_HOSPITAL_ID,
  branchId: process.env.WHATSAPP_BRANCH_ID,
  permissions: ['whatsapp.inbox.view', 'whatsapp.inbox.reply', 'whatsapp.inbox.resolve'],
}, process.env.JWT_SECRET, { algorithm: 'HS256', subject: 'local-whatsapp-developer', issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '30m' });
console.log(token);
