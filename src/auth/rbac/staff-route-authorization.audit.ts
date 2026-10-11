import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/** Controllers that are intentionally outside staff RBAC (public, portal, webhooks). */
export const STAFF_RBAC_EXEMPT_CONTROLLER_SUFFIXES = [
  'auth.controller.ts',
  'health.controller.ts',
  'abdm-callback.controller.ts',
  'razorpay-webhook.controller.ts',
  'patient-portal-auth.controller.ts',
] as const;

export const STAFF_RBAC_EXEMPT_PATH_SEGMENTS = [
  `${join('portal', 'portal-')}`,
  `${join('portal', 'patient-portal')}`,
] as const;

export type StaffRouteAuthorizationViolation = {
  file: string;
  reason: string;
};

function listControllerFiles(srcRoot: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.endsWith('.controller.ts')) {
        results.push(full);
      }
    }
  };
  walk(srcRoot);
  return results.sort();
}

function isExemptController(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  if (
    STAFF_RBAC_EXEMPT_CONTROLLER_SUFFIXES.some((suffix) =>
      normalized.endsWith(suffix),
    )
  ) {
    return true;
  }
  if (normalized.includes('portal/')) {
    return true;
  }
  return false;
}

/**
 * Static audit: every non-exempt controller that uses JwtAuthGuard must also
 * declare PermissionsGuard (class or method level).
 */
export function auditStaffControllerAuthorization(
  srcRoot: string,
): StaffRouteAuthorizationViolation[] {
  const violations: StaffRouteAuthorizationViolation[] = [];
  const controllers = listControllerFiles(srcRoot);

  for (const file of controllers) {
    const rel = relative(srcRoot, file).replace(/\\/g, '/');
    if (isExemptController(rel)) {
      continue;
    }

    const source = readFileSync(file, 'utf8');
    const usesStaffJwt =
      source.includes('JwtAuthGuard') || source.includes('@UseGuards(JwtAuthGuard');
    if (!usesStaffJwt) {
      continue;
    }

    const hasPermissionsGuard = source.includes('PermissionsGuard');
    if (!hasPermissionsGuard) {
      violations.push({
        file: rel,
        reason:
          'Staff JWT routes must include PermissionsGuard with @RequirePermissions',
      });
      continue;
    }

    if (!source.includes('@RequirePermissions')) {
      violations.push({
        file: rel,
        reason:
          'PermissionsGuard is present but no @RequirePermissions metadata found',
      });
    }
  }

  return violations;
}
