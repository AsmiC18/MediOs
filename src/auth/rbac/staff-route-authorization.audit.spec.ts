import { join } from 'path';
import {
  auditStaffControllerAuthorization,
  STAFF_RBAC_EXEMPT_CONTROLLER_SUFFIXES,
} from './staff-route-authorization.audit';

describe('Staff route authorization audit', () => {
  const srcRoot = join(__dirname, '..', '..');

  it('documents exempt controller suffixes', () => {
    expect(STAFF_RBAC_EXEMPT_CONTROLLER_SUFFIXES.length).toBeGreaterThan(0);
  });

  it('finds no staff controller missing PermissionsGuard', () => {
    const violations = auditStaffControllerAuthorization(srcRoot);
    expect(violations).toEqual([]);
  });
});
