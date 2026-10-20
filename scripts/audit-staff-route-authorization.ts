import { join } from 'path';
import { auditStaffControllerAuthorization } from '../src/auth/rbac/staff-route-authorization.audit';

const srcRoot = join(__dirname, '..', 'src');
const violations = auditStaffControllerAuthorization(srcRoot);

if (violations.length > 0) {
  console.error('Staff route authorization audit failed:\n');
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.reason}`);
  }
  console.error(
    `\n${violations.length} controller(s) missing PermissionsGuard / @RequirePermissions.`,
  );
  console.error(
    'Exempt controllers: auth, health, ABDM callbacks, Razorpay webhooks, patient portal (see STAFF_RBAC_EXEMPT_CONTROLLER_SUFFIXES).',
  );
  process.exit(1);
}

console.log(
  `Staff route authorization audit passed (${srcRoot.replace(/\\/g, '/')}).`,
);
