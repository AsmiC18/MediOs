import jwt from 'jsonwebtoken';
import { resolveJwtSecret } from '../../src/common/config/jwt.config';

export type StaffHttpAuthUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  roleId: string;
  role: string;
};

export function signStaffBearerToken(user: StaffHttpAuthUser): string {
  return jwt.sign(user, resolveJwtSecret(), { expiresIn: '15m' });
}

export function authorizationHeader(user: StaffHttpAuthUser): {
  Authorization: string;
} {
  return { Authorization: `Bearer ${signStaffBearerToken(user)}` };
}
