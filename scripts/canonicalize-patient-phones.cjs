const { PrismaClient } = require('@prisma/client');

function previewCanonical(input) {
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (!digits.startsWith('91') || digits.length !== 12) return null;
  const local = digits.slice(2);
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

async function main() {
  const prisma = new PrismaClient();
  const patients = await prisma.patient.findMany({
    where: { mergedIntoPatientId: null },
    select: { id: true, hospitalId: true, phone: true },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map();
  for (const patient of patients) {
    const canonical = previewCanonical(patient.phone);
    if (!canonical) continue;
    const key = `${patient.hospitalId}|${canonical}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...patient, canonical });
  }

  let updated = 0;
  let skippedAlreadyCanonical = 0;
  let skippedInvalid = 0;
  let skippedDuplicate = 0;

  for (const patient of patients) {
    const canonical = previewCanonical(patient.phone);
    if (!canonical) {
      skippedInvalid += 1;
      continue;
    }

    const key = `${patient.hospitalId}|${canonical}`;
    const group = groups.get(key) ?? [];

    if (group.length > 1) {
      if (patient.id === group[0].id) {
        skippedDuplicate += group.length;
        console.log(`SKIP duplicate group ${key} (${group.length} patients)`);
      }
      continue;
    }

    if (patient.phone === canonical) {
      skippedAlreadyCanonical += 1;
      continue;
    }

    await prisma.patient.update({
      where: { id: patient.id },
      data: { phone: canonical },
    });
    updated += 1;
  }

  console.log(
    JSON.stringify({
      updated,
      skippedAlreadyCanonical,
      skippedInvalid,
      skippedDuplicate,
    }),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
