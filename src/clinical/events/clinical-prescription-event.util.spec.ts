import { PrescriptionStatus } from '@prisma/client';
import {
  CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
  CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE,
  clinicalPrescriptionCreatedIdempotencyKey,
  clinicalPrescriptionStatusChangedIdempotencyKey,
} from './clinical-prescription-event.util';

describe('clinical prescription event util', () => {
  it('uses deterministic idempotency keys', () => {
    expect(clinicalPrescriptionCreatedIdempotencyKey('rx-1')).toBe(
      `${CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE}:rx-1`,
    );
    expect(
      clinicalPrescriptionStatusChangedIdempotencyKey({
        prescriptionId: 'rx-1',
        previousStatus: PrescriptionStatus.ACTIVE,
        newStatus: PrescriptionStatus.COMPLETED,
      }),
    ).toBe(
      `${CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE}:rx-1:ACTIVE->COMPLETED`,
    );
  });
});
