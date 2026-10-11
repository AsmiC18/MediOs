import { Prisma } from '@prisma/client';
import {
  IPD_ACTIVE_ADMISSION_UNIQUE_INDEX,
  isActiveAdmissionUniqueViolation,
} from './admission-unique.util';

describe('isActiveAdmissionUniqueViolation', () => {
  it('detects partial unique index by name', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: [IPD_ACTIVE_ADMISSION_UNIQUE_INDEX] },
    });
    expect(isActiveAdmissionUniqueViolation(error)).toBe(true);
  });

  it('detects hospitalId+patientId target', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['hospitalId', 'patientId'] },
    });
    expect(isActiveAdmissionUniqueViolation(error)).toBe(true);
  });

  it('ignores admission number unique violations', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['hospitalId', 'admissionNumber'] },
    });
    expect(isActiveAdmissionUniqueViolation(error)).toBe(false);
  });
});
