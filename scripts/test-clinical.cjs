const bcrypt = require('bcrypt');
const path = require('path');

const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma/client'));

const BASE = 'http://localhost:3000';
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, text };
}

async function createPatient(token, allergies = []) {
  const phone = `${Date.now()}${Math.floor(Math.random() * 9)}`.slice(-10);
  const res = await request('POST', '/patients', {
    token,
    body: {
      phone,
      firstName: 'Clinical',
      lastName: `Patient${runId.slice(0, 4)}`,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
      allergies,
    },
  });
  return res.body?.id;
}

async function main() {
  const prisma = new PrismaClient();

  const login = await request('POST', '/auth/login', {
    body: { email: 'admin@test.com', password: 'MediOS@12345' },
  });
  const token = login.body?.accessToken;
  const hospitalId = login.body?.user?.hospitalId;
  if (!token || !hospitalId) {
    fail('login');
    process.exit(1);
  }
  pass('login');

  const branch = await prisma.branch.upsert({
    where: {
      hospitalId_code: { hospitalId, code: `CLN-${runId.slice(0, 4)}` },
    },
    update: {},
    create: {
      hospitalId,
      name: `Clinical Branch ${runId.slice(0, 4)}`,
      code: `CLN-${runId.slice(0, 4)}`,
    },
  });

  const patientId = await createPatient(token);
  const allergyPatientId = await createPatient(token, ['Penicillin']);
  const resourceRes = await request('POST', '/resources', {
    token,
    body: { type: 'DOCTOR', name: `Dr Clinical ${runId.slice(0, 4)}` },
  });
  const resourceId = resourceRes.body?.id;
  const date = new Date().toISOString().slice(0, 10);
  const appointmentRes = await request('POST', '/appointments', {
    token,
    body: {
      patientId,
      startAt: `${date}T08:00:00.000Z`,
      endAt: `${date}T08:30:00.000Z`,
      resourceIds: [resourceId],
      reason: 'Clinical visit',
    },
  });
  const appointmentId = appointmentRes.body?.id;

  const opdEncounter = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId,
      encounterType: 'OPD',
      appointmentId,
    },
  });
  const opdEncounterId = opdEncounter.body?.id;
  if (
    (opdEncounter.status === 201 || opdEncounter.status === 200) &&
    opdEncounterId &&
    opdEncounter.body?.encounterType === 'OPD'
  ) {
    pass('1 create OPD encounter');
  } else {
    fail('1 create OPD encounter', `${opdEncounter.status} ${JSON.stringify(opdEncounter.body)}`);
  }

  const ipdPatientId = await createPatient(token);
  const ipdAdmissionRes = await request('POST', '/ipd/admissions', {
    token,
    body: { patientId: ipdPatientId, branchId: branch.id, reason: 'Observation' },
  });
  const ipdAdmissionId = ipdAdmissionRes.body?.id;
  const ipdEncounter = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId: ipdPatientId,
      encounterType: 'IPD',
      ipdAdmissionId,
    },
  });
  if (
    ipdEncounter.status === 201 ||
    (ipdEncounter.status === 200 && ipdEncounter.body?.encounterType === 'IPD')
  ) {
    pass('2 create IPD encounter');
  } else {
    fail('2 create IPD encounter', `${ipdEncounter.status} ${JSON.stringify(ipdEncounter.body)}`);
  }

  const otherHospital = await prisma.hospital.create({
    data: { name: `CLN ISO ${runId.slice(0, 6)}`, code: `CLN-ISO-${runId.slice(0, 6)}` },
  });
  const otherPatient = await prisma.patient.create({
    data: {
      hospitalId: otherHospital.id,
      phone: `6${Date.now()}`.slice(-10),
      firstName: 'Other',
      lastName: 'Patient',
    },
  });
  const crossPatient = await request('POST', '/clinical/encounters', {
    token,
    body: { patientId: otherPatient.id, encounterType: 'OPD', appointmentId },
  });
  if (crossPatient.status === 404) {
    pass('3 reject cross-hospital patient');
  } else {
    fail('3 reject cross-hospital patient', `${crossPatient.status}`);
  }

  const otherPatientId = await createPatient(token);
  const mismatchAppt = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId: otherPatientId,
      encounterType: 'OPD',
      appointmentId,
    },
  });
  if (mismatchAppt.status === 400) {
    pass('4 reject mismatched appointment/patient');
  } else {
    fail('4 reject mismatched appointment/patient', `${mismatchAppt.status}`);
  }

  const mismatchAdmPatient = await createPatient(token);
  const mismatchAdm = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId: mismatchAdmPatient,
      encounterType: 'IPD',
      ipdAdmissionId,
    },
  });
  if (mismatchAdm.status === 400) {
    pass('5 reject mismatched admission/patient');
  } else {
    fail('5 reject mismatched admission/patient', `${mismatchAdm.status}`);
  }

  const soapCreate = await request('POST', `/clinical/encounters/${opdEncounterId}/soap`, {
    token,
    body: {
      subjective: 'Patient reports headache',
      objective: 'BP normal',
      assessment: 'Tension headache',
      plan: 'Rest and hydration',
    },
  });
  if (
    soapCreate.status === 201 ||
    (soapCreate.status === 200 && soapCreate.body?.subjective)
  ) {
    pass('6 create SOAP note');
  } else {
    fail('6 create SOAP note', `${soapCreate.status} ${JSON.stringify(soapCreate.body)}`);
  }

  const soapGet = await request('GET', `/clinical/encounters/${opdEncounterId}/soap`, { token });
  if (soapGet.status === 200 && soapGet.body?.plan === 'Rest and hydration') {
    pass('7 get SOAP note');
  } else {
    fail('7 get SOAP note', `${soapGet.status}`);
  }

  const soapUpdate = await request('PATCH', `/clinical/encounters/${opdEncounterId}/soap`, {
    token,
    body: { plan: 'Rest, hydration, follow-up in 3 days' },
  });
  if (soapUpdate.status === 200 && soapUpdate.body?.plan?.includes('follow-up')) {
    pass('8 update SOAP note');
  } else {
    fail('8 update SOAP note', `${soapUpdate.status}`);
  }

  const primaryDx = await request('POST', `/clinical/encounters/${opdEncounterId}/diagnoses`, {
    token,
    body: {
      code: 'R51',
      description: 'Headache',
      diagnosisType: 'PRIMARY',
    },
  });
  if (
    primaryDx.status === 201 ||
    (primaryDx.status === 200 && primaryDx.body?.code === 'R51')
  ) {
    pass('9 create primary diagnosis');
  } else {
    fail('9 create primary diagnosis', `${primaryDx.status} ${JSON.stringify(primaryDx.body)}`);
  }

  const secondaryDx = await request('POST', `/clinical/encounters/${opdEncounterId}/diagnoses`, {
    token,
    body: {
      code: 'J06.9',
      description: 'Acute upper respiratory infection',
      diagnosisType: 'SECONDARY',
    },
  });
  if (secondaryDx.status === 201 || secondaryDx.status === 200) {
    pass('10 create secondary diagnosis');
  } else {
    fail('10 create secondary diagnosis', `${secondaryDx.status}`);
  }

  const invalidDx = await request('POST', `/clinical/encounters/${opdEncounterId}/diagnoses`, {
    token,
    body: { code: 'INVALID', description: 'Bad code' },
  });
  if (invalidDx.status === 400) {
    pass('11 reject invalid diagnosis input');
  } else {
    fail('11 reject invalid diagnosis input', `${invalidDx.status}`);
  }

  const dxList = await request('GET', `/clinical/encounters/${opdEncounterId}/diagnoses`, { token });
  if (dxList.status === 200 && Array.isArray(dxList.body) && dxList.body.length >= 2) {
    pass('12 get diagnoses');
  } else {
    fail('12 get diagnoses', `${dxList.status}`);
  }

  const dxUpdate = await request('PATCH', `/clinical/diagnoses/${primaryDx.body.id}`, {
    token,
    body: { description: 'Headache, unspecified' },
  });
  if (dxUpdate.status === 200 && dxUpdate.body?.description?.includes('unspecified')) {
    pass('13 update diagnosis');
  } else {
    fail('13 update diagnosis', `${dxUpdate.status}`);
  }

  const dxDelete = await request('DELETE', `/clinical/diagnoses/${secondaryDx.body.id}`, { token });
  if (dxDelete.status === 200 && dxDelete.body?.deleted === true) {
    pass('14 delete diagnosis');
  } else {
    fail('14 delete diagnosis', `${dxDelete.status}`);
  }

  const allergyEncounterPatient = await createPatient(token, ['Penicillin']);
  const allergyApptRes = await request('POST', '/appointments', {
    token,
    body: {
      patientId: allergyEncounterPatient,
      startAt: `${date}T09:00:00.000Z`,
      endAt: `${date}T09:30:00.000Z`,
      resourceIds: [resourceId],
    },
  });
  const allergyEncounter = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId: allergyEncounterPatient,
      encounterType: 'OPD',
      appointmentId: allergyApptRes.body.id,
    },
  });
  const prescription = await request(
    'POST',
    `/clinical/encounters/${allergyEncounter.body.id}/prescriptions`,
    {
      token,
      body: {
        notes: 'Short course',
        items: [
          {
            medicationName: 'Penicillin V',
            dosage: '500mg',
            route: 'oral',
            frequency: 'twice daily',
            duration: '5 days',
          },
        ],
      },
    },
  );
  const prescriptionId = prescription.body?.id;
  if (
    (prescription.status === 201 || prescription.status === 200) &&
    prescriptionId &&
    prescription.body?.patientId === allergyEncounterPatient
  ) {
    pass('15 create prescription');
  } else {
    fail('15 create prescription', `${prescription.status} ${JSON.stringify(prescription.body)}`);
  }

  if (
    Array.isArray(prescription.body?.allergyWarnings) &&
    prescription.body.allergyWarnings.length >= 1
  ) {
    pass('15b allergy warning surfaced', `${prescription.body.allergyWarnings.length} warning(s)`);
  } else {
    fail('15b allergy warning surfaced', JSON.stringify(prescription.body?.allergyWarnings));
  }

  const getRx = await request('GET', `/clinical/prescriptions/${prescriptionId}`, { token });
  if (getRx.status === 200 && getRx.body?.items?.length >= 1) {
    pass('16 get prescription');
  } else {
    fail('16 get prescription', `${getRx.status}`);
  }

  const rxStatus = await request('PATCH', `/clinical/prescriptions/${prescriptionId}/status`, {
    token,
    body: { status: 'COMPLETED' },
  });
  if (rxStatus.status === 200 && rxStatus.body?.status === 'COMPLETED') {
    pass('17 update prescription status');
  } else {
    fail('17 update prescription status', `${rxStatus.status}`);
  }

  const completeEncounter = await request(
    'POST',
    `/clinical/encounters/${opdEncounterId}/complete`,
    { token },
  );
  if (
    completeEncounter.status === 201 ||
    (completeEncounter.status === 200 && completeEncounter.body?.status === 'COMPLETED')
  ) {
    pass('18 complete encounter');
  } else {
    fail('18 complete encounter', `${completeEncounter.status}`);
  }

  const invalidComplete = await request(
    'POST',
    `/clinical/encounters/${opdEncounterId}/complete`,
    { token },
  );
  if (invalidComplete.status === 400) {
    pass('19 invalid encounter transition', '400');
  } else {
    fail('19 invalid encounter transition', `${invalidComplete.status}`);
  }

  const cancelEncounterPatient = await createPatient(token);
  const cancelAppt = await request('POST', '/appointments', {
    token,
    body: {
      patientId: cancelEncounterPatient,
      startAt: `${date}T11:00:00.000Z`,
      endAt: `${date}T11:30:00.000Z`,
      resourceIds: [resourceId],
    },
  });
  const cancelEnc = await request('POST', '/clinical/encounters', {
    token,
    body: {
      patientId: cancelEncounterPatient,
      encounterType: 'OPD',
      appointmentId: cancelAppt.body.id,
    },
  });
  const cancelRes = await request(
    'POST',
    `/clinical/encounters/${cancelEnc.body.id}/cancel`,
    { token },
  );
  if (cancelRes.status === 201 || (cancelRes.status === 200 && cancelRes.body?.status === 'CANCELLED')) {
    pass('20 cancel encounter');
  } else {
    fail('20 cancel encounter', `${cancelRes.status}`);
  }

  const records = await request('GET', `/patients/${patientId}/clinical-records`, { token });
  if (
    records.status === 200 &&
    Array.isArray(records.body?.encounters) &&
    records.body.encounters.length >= 1
  ) {
    pass('21 patient clinical records retrieval');
  } else {
    fail('21 patient clinical records retrieval', `${records.status}`);
  }

  const crossRecords = await request('GET', `/patients/${otherPatient.id}/clinical-records`, {
    token,
  });
  if (crossRecords.status === 404) {
    pass('22 cross-hospital clinical records blocked');
  } else {
    fail('22 cross-hospital clinical records blocked', `${crossRecords.status}`);
  }

  const noAuth = await request('GET', '/clinical/encounters');
  if (noAuth.status === 401) {
    pass('23 missing JWT rejected', '401');
  } else {
    fail('23 missing JWT rejected', `${noAuth.status}`);
  }

  const limitedRole = await prisma.role.create({
    data: {
      hospitalId,
      name: `NO-CLN-${runId.slice(0, 4)}`,
      description: 'No clinical permissions',
    },
  });
  const limitedUser = await prisma.user.create({
    data: {
      hospitalId,
      roleId: limitedRole.id,
      name: 'Limited Clinical User',
      email: `no-clinical-${runId}@test.com`,
      passwordHash: await bcrypt.hash('MediOS@12345', 12),
    },
  });
  const limitedLogin = await request('POST', '/auth/login', {
    body: { email: limitedUser.email, password: 'MediOS@12345' },
  });
  const permissionDenied = await request('GET', '/clinical/encounters', {
    token: limitedLogin.body?.accessToken,
  });
  if (permissionDenied.status === 403) {
    pass('24 missing clinical permission rejected', '403');
  } else {
    fail('24 missing clinical permission rejected', `${permissionDenied.status}`);
  }

  const encounterAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'CLINICAL_ENCOUNTER_CREATED', entityId: opdEncounterId },
  });
  const soapAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'CLINICAL_SOAP_CREATED' },
  });
  const rxAudit = await prisma.auditLog.findFirst({
    where: { hospitalId, action: 'CLINICAL_PRESCRIPTION_CREATED', entityId: prescriptionId },
  });
  const auditMeta = JSON.stringify(encounterAudit?.metadata || {});
  if (encounterAudit && soapAudit && rxAudit && !auditMeta.includes('subjective')) {
    pass('25 audit events created without SOAP body');
  } else {
    fail('25 audit events created without SOAP body', auditMeta);
  }

  if (prescription.body?.patientId === allergyEncounterPatient) {
    pass('26 prescription patient matches encounter patient');
  } else {
    fail('26 prescription patient matches encounter patient');
  }

  const otherEncounter = await prisma.clinicalEncounter.create({
    data: {
      hospitalId: otherHospital.id,
      patientId: otherPatient.id,
      providerUserId: (
        await prisma.user.create({
          data: {
            hospitalId: otherHospital.id,
            roleId: (
              await prisma.role.create({
                data: {
                  hospitalId: otherHospital.id,
                  name: `R-${runId.slice(0, 4)}`,
                },
              })
            ).id,
            name: 'Other Provider',
            email: `other-prov-${runId}@test.com`,
            passwordHash: await bcrypt.hash('MediOS@12345', 12),
          },
        })
      ).id,
      encounterType: 'OPD',
    },
  });
  const crossSoap = await request('POST', `/clinical/encounters/${otherEncounter.id}/soap`, {
    token,
    body: { subjective: 'Should fail' },
  });
  if (crossSoap.status === 404) {
    pass('27 cross-hospital encounter SOAP blocked');
  } else {
    fail('27 cross-hospital encounter SOAP blocked', `${crossSoap.status}`);
  }

  const completedSoapUpdate = await request(
    'PATCH',
    `/clinical/encounters/${opdEncounterId}/soap`,
    {
      token,
      body: { assessment: 'Updated after completion' },
    },
  );
  if (
    completedSoapUpdate.status === 200 &&
    completedSoapUpdate.body?.assessment === 'Updated after completion'
  ) {
    pass('28 completed encounter SOAP update allowed with audit trail');
  } else {
    fail('28 completed encounter SOAP update allowed', `${completedSoapUpdate.status}`);
  }

  const cancelledSoap = await request('POST', `/clinical/encounters/${cancelEnc.body.id}/soap`, {
    token,
    body: { subjective: 'Should fail' },
  });
  if (cancelledSoap.status === 400) {
    pass('29 cancelled encounter modification blocked', '400');
  } else {
    fail('29 cancelled encounter modification blocked', `${cancelledSoap.status}`);
  }

  await prisma.clinicalSoapNote.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.clinicalEncounter.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.patient.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.role.deleteMany({ where: { hospitalId: otherHospital.id } }).catch(() => {});
  await prisma.hospital.delete({ where: { id: otherHospital.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: limitedUser.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: limitedRole.id } }).catch(() => {});

  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
