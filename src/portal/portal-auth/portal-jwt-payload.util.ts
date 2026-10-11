import { UnauthorizedException } from '@nestjs/common';
import {
  PATIENT_PRINCIPAL_TYPE,
  PatientJwtPayload,
  PatientPrincipal,
} from '../portal.types';

export function toPatientPrincipal(payload: PatientJwtPayload): PatientPrincipal {
  if (payload.principalType !== PATIENT_PRINCIPAL_TYPE) {
    throw new UnauthorizedException();
  }
  if (!payload.sub || !payload.hospitalId) {
    throw new UnauthorizedException();
  }

  return {
    principalType: PATIENT_PRINCIPAL_TYPE,
    patientId: payload.sub,
    hospitalId: payload.hospitalId,
    branchId: payload.branchId ?? null,
  };
}
