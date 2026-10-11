import { PrescriptionSafetyFindingType } from '@prisma/client';

export function buildFindingKey(
  findingType: PrescriptionSafetyFindingType,
  ...parts: (string | number | null | undefined)[]
): string {
  const normalized = parts
    .map((part) => (part == null ? '' : String(part).trim().toLowerCase()))
    .filter(Boolean)
    .join(':');
  return `${findingType}:${normalized}`;
}
