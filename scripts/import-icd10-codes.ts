/**
 * Load ICD-10 codes from a JSON file into the global Icd10Code table.
 *
 * JSON shape: [{ "code": "J06.9", "description": "...", "isActive": true }]
 *
 * This script does not ship a complete WHO catalogue. Obtain an authoritative
 * dataset from your licensed source and import it during deployment.
 *
 * Usage: npx ts-node --compiler-options {\"module\":\"CommonJS\"} scripts/import-icd10-codes.ts path/to/codes.json
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { validateIcd10Code } from '../src/clinical/utils/icd10-format.util';

type ImportRow = {
  code: string;
  description: string;
  isActive?: boolean;
};

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: import-icd10-codes.ts <path-to-json>');
    process.exit(1);
  }

  const absolute = path.resolve(fileArg);
  const raw = fs.readFileSync(absolute, 'utf8');
  const rows = JSON.parse(raw) as ImportRow[];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('JSON must be a non-empty array');
  }

  const prisma = new PrismaClient();
  let imported = 0;

  try {
    for (const row of rows) {
      const code = validateIcd10Code(row.code);
      const description = row.description?.trim();
      if (!description) {
        throw new Error(`Missing description for code ${code}`);
      }

      await prisma.icd10Code.upsert({
        where: { code },
        update: {
          description,
          isActive: row.isActive ?? true,
        },
        create: {
          code,
          description,
          isActive: row.isActive ?? true,
        },
      });
      imported += 1;
    }

    console.log(`Imported ${imported} ICD-10 code(s) from ${absolute}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
