import { PatientPrincipal } from '../portal.types';

export function portalPrincipalToScopeUser(principal: PatientPrincipal) {
  return {
    sub: principal.patientId,
    hospitalId: principal.hospitalId,
    branchId: principal.branchId,
  };
}

export function portalHospitalScope(principal: PatientPrincipal) {
  return {
    hospitalId: principal.hospitalId,
    branchId: principal.branchId,
  };
}
