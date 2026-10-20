import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import {
  auditStaffControllerAuthorization,
  STAFF_RBAC_EXEMPT_CONTROLLER_SUFFIXES,
} from './staff-route-authorization.audit';

function writeFixtureController(root: string, relPath: string, source: string) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, source, 'utf8');
}

describe('Staff route authorization audit', () => {
  const srcRoot = join(__dirname, '..', '..');

  it('documents exempt controller suffixes', () => {
    expect(STAFF_RBAC_EXEMPT_CONTROLLER_SUFFIXES).toEqual(
      expect.arrayContaining([
        'auth.controller.ts',
        'health.controller.ts',
        'abdm-callback.controller.ts',
        'razorpay-webhook.controller.ts',
        'patient-portal-auth.controller.ts',
      ]),
    );
  });

  it('finds no staff controller missing PermissionsGuard in the real src tree', () => {
    const violations = auditStaffControllerAuthorization(srcRoot);
    expect(violations).toEqual([]);
  });

  describe('fixture controllers (isolated temp tree)', () => {
    let tempRoot: string;

    beforeEach(() => {
      tempRoot = mkdtempSync(join(tmpdir(), 'staff-rbac-audit-'));
    });

    afterEach(() => {
      rmSync(tempRoot, { recursive: true, force: true });
    });

    it('accepts staff controllers with JwtAuthGuard, PermissionsGuard, and @RequirePermissions', () => {
      writeFixtureController(
        tempRoot,
        'orders/orders.controller.ts',
        `
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('orders:read')
export class OrdersController {}
`,
      );

      expect(auditStaffControllerAuthorization(tempRoot)).toEqual([]);
    });

    it('skips intentional public auth and health controllers without JWT guards', () => {
      writeFixtureController(
        tempRoot,
        'auth/auth.controller.ts',
        `@Controller('auth') export class AuthController {}`,
      );
      writeFixtureController(
        tempRoot,
        'common/health/health.controller.ts',
        `@Controller('health') export class HealthController {}`,
      );

      expect(auditStaffControllerAuthorization(tempRoot)).toEqual([]);
    });

    it('skips webhook controllers that use signature verification instead of staff JWT', () => {
      writeFixtureController(
        tempRoot,
        'billing/razorpay-webhook.controller.ts',
        `@Controller('webhooks') export class RazorpayWebhookController {}`,
      );
      writeFixtureController(
        tempRoot,
        'abdm/abdm-callback.controller.ts',
        `@Controller('abdm/callbacks') export class AbdmCallbackController {}`,
      );

      expect(auditStaffControllerAuthorization(tempRoot)).toEqual([]);
    });

    it('skips patient portal controllers under portal/', () => {
      writeFixtureController(
        tempRoot,
        'portal/portal-billing/portal-billing.controller.ts',
        `@Controller('portal/billing') export class PortalBillingController {}`,
      );

      expect(auditStaffControllerAuthorization(tempRoot)).toEqual([]);
    });

    it('flags JwtAuthGuard staff controllers missing PermissionsGuard', () => {
      writeFixtureController(
        tempRoot,
        'staff/unprotected.controller.ts',
        `
@UseGuards(JwtAuthGuard)
export class UnprotectedStaffController {}
`,
      );

      const violations = auditStaffControllerAuthorization(tempRoot);
      expect(violations).toEqual([
        {
          file: 'staff/unprotected.controller.ts',
          reason:
            'Staff JWT routes must include PermissionsGuard with @RequirePermissions',
        },
      ]);
    });

    it('flags PermissionsGuard without @RequirePermissions metadata', () => {
      writeFixtureController(
        tempRoot,
        'staff/missing-metadata.controller.ts',
        `
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MissingMetadataController {}
`,
      );

      const violations = auditStaffControllerAuthorization(tempRoot);
      expect(violations).toEqual([
        {
          file: 'staff/missing-metadata.controller.ts',
          reason:
            'PermissionsGuard is present but no @RequirePermissions metadata found',
        },
      ]);
    });
  });
});
