const bcrypt = require('bcrypt');
const { loginBody } = require('./lib/login-body.cjs');
const { ensureAdminPhase1Permissions } = require('./lib/ensure-admin-permissions.cjs');
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

  const localDigits = `9${`${Date.now()}`.slice(-9)}`;

  const tenDigit = await request('POST', '/patients', {
    token,
    body: { phone: localDigits, firstName: 'Ten', lastName: `Digit${uniqueSuffix.slice(0, 4)}` },
  });
  if (
    (tenDigit.status === 201 || tenDigit.status === 200) &&
    tenDigit.body?.phone === `+91${localDigits}`
  ) {
    pass('1 10-digit Indian number accepted');
    pass('8 canonical phone stored', tenDigit.body.phone);
  } else {
    fail('1 10-digit Indian number accepted', `${tenDigit.status} ${tenDigit.body?.phone}`);
  }

  const plusFormat = await request('POST', '/patients', {
    token,
    body: {
      phone: `+91 ${localDigits.slice(0, 5)}-${localDigits.slice(5)}`,
      firstName: 'Dup',
      lastName: 'Check',
    },
  });
  if (plusFormat.status === 409) {
    pass('4 same canonical phone rejected on create', '409');
  } else {
    fail('4 same canonical phone rejected on create', `${plusFormat.status}`);
  }

  const spaced = `9${`${Date.now()}`.slice(-9)}`;
  const spacedCreate = await request('POST', '/patients', {
    token,
    body: {
      phone: `+91 ${spaced.slice(0, 5)} ${spaced.slice(5)}`,
      firstName: 'Space',
      lastName: 'Norm',
    },
  });
  if (spacedCreate.body?.phone === `+91${spaced}`) {
    pass('2 +91 format accepted');
    pass('3 spaces/hyphens normalized', spacedCreate.body.phone);
  } else {
    fail('3 spaces/hyphens normalized', `${spacedCreate.status} ${spacedCreate.body?.phone}`);
  }

  const invalid = await request('POST', '/patients', {
    token,
    body: { phone: '12345', firstName: 'Bad', lastName: 'Phone' },
  });
  if (invalid.status === 400) {
    pass('7 invalid phone rejected', '400');
  } else {
    fail('7 invalid phone rejected', `${invalid.status}`);
  }

  const updateDigits = `9${`${Date.now()}`.slice(-9)}`;
  const updatePatient = await request('POST', '/patients', {
    token,
    body: { phone: updateDigits, firstName: 'Update', lastName: 'Me' },
  });
  const updateId = updatePatient.body?.id;
  const duplicateTarget = await request('POST', '/patients', {
    token,
    body: { phone: `9${`${Date.now()}`.slice(-9)}`, firstName: 'Other', lastName: 'Patient' },
  });
  const dupUpdate = await request('PATCH', `/patients/${updateId}`, {
    token,
    body: { phone: duplicateTarget.body?.phone },
  });
  if (dupUpdate.status === 409) {
    pass('5 duplicate phone update rejected', '409');
  } else {
    fail('5 duplicate phone update rejected', `${dupUpdate.status}`);
  }

  const sharedDigits = `9${`${Date.now()}`.slice(-9)}`;
  const hospitalOne = await request('POST', '/patients', {
    token,
    body: { phone: sharedDigits, firstName: 'HospOne', lastName: 'Shared' },
  });

  const otherHospital = await prisma.hospital.create({
    data: { name: `PAT ISO ${uniqueSuffix}`, code: `PAT-ISO-${uniqueSuffix}` },
  });
  const otherRole = await prisma.role.create({
    data: { hospitalId: otherHospital.id, name: 'ADMIN' },
  });
  for (const permName of ['patients:read', 'patients:create', 'patients:update']) {
    const perm = await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: { name: permName, description: permName },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: otherRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: otherRole.id, permissionId: perm.id },
    });
  }
  const otherUser = await prisma.user.create({
    data: {
      hospitalId: otherHospital.id,
      roleId: otherRole.id,
      name: 'Other Admin',
      email: `pat-other-${uniqueSuffix}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const otherLogin = await request('POST', '/auth/login', {
    body: loginBody(otherUser.email, 'MediOS@12345', otherHospital.code),
  });
  const otherToken = otherLogin.body?.accessToken;

  const hospitalTwo = await request('POST', '/patients', {
    token: otherToken,
    body: { phone: sharedDigits, firstName: 'HospTwo', lastName: 'Shared' },
  });
  if (
    (hospitalOne.status === 201 || hospitalOne.status === 200) &&
    (hospitalTwo.status === 201 || hospitalTwo.status === 200)
  ) {
    pass('6 cross-hospital same phone allowed');
  } else {
    fail(
      '6 cross-hospital same phone allowed',
      `h1=${hospitalOne.status} h2=${hospitalTwo.status}`,
    );
  }

  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.role.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: otherHospital.id } }).catch(() => {});
  await prisma.$disconnect();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
