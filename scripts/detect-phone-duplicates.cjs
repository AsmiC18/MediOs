const { PrismaClient } = require('@prisma/client');

function previewCanonical(input) {
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
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
  });

  const groups = new Map();
  for (const patient of patients) {
    const canonical = previewCanonical(patient.phone);
    if (!canonical) continue;
    const key = `${patient.hospitalId}|${canonical}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(patient);
  }

  let dupGroups = 0;
  for (const [key, group] of groups) {
    if (group.length > 1) {
      dupGroups += 1;
      console.log('DUPLICATE GROUP', key);
      for (const p of group) console.log(`  - ${p.id} phone=${p.phone}`);
    }
  }

  console.log(
    JSON.stringify({
      totalPatients: patients.length,
      duplicateCanonicalGroups: dupGroups,
    }),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
