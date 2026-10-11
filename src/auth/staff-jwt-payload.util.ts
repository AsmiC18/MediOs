import { UnauthorizedException } from '@nestjs/common';
import { PATIENT_PRINCIPAL_TYPE } from '../portal/portal.types';

export type StaffJwtPayload = {
  principalType?: string;
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  roleId?: string;
  role?: string;
};

export type StaffJwtUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  roleId: string;
  role: string;
};

export function toStaffJwtUser(payload: StaffJwtPayload): StaffJwtUser {
  if (payload.principalType === PATIENT_PRINCIPAL_TYPE) {
    throw new UnauthorizedException();
  }
  if (!payload.roleId) {
    throw new UnauthorizedException();
  }
  return payload as StaffJwtUser;
}
