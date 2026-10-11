import { PrismaClient } from '@prisma/client';

/**
 * DEVELOPMENT FIXTURE ONLY — not a complete WHO ICD-10 catalogue.
 * Production deployments must load an authoritative ICD-10 dataset (see scripts/import-icd10-codes.ts).
 */
export const ICD10_DEVELOPMENT_FIXTURE: ReadonlyArray<{
  code: string;
  description: string;
  isActive?: boolean;
}> = [
  {
    code: 'A00.0',
    description: 'Cholera due to Vibrio cholerae 01, biovar cholerae',
  },
  {
    code: 'J06.9',
    description: 'Acute upper respiratory infection, unspecified',
  },
  {
    code: 'R50.9',
    description: 'Fever, unspecified',
  },
  {
    code: 'R51',
    description: 'Headache',
  },
  {
    code: 'Z99.9',
    description: 'Dependence on enabling machines and devices, unspecified',
    isActive: false,
  },
];

export async function upsertDevelopmentIcd10Fixture(
  prisma: Pick<PrismaClient, 'icd10Code'>,
): Promise<void> {
  for (const entry of ICD10_DEVELOPMENT_FIXTURE) {
    await prisma.icd10Code.upsert({
      where: { code: entry.code },
      update: {
        description: entry.description,
        isActive: entry.isActive ?? true,
      },
      create: {
        code: entry.code,
        description: entry.description,
        isActive: entry.isActive ?? true,
      },
    });
  }
}
