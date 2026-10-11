import { readFileSync } from 'fs';
import { join } from 'path';

describe('Scheduling controller permission metadata', () => {
  const root = join(__dirname, '..');

  const controllers = [
    {
      file: join(root, 'scheduling/appointments/appointments.controller.ts'),
      read: 'scheduling:read',
      manage: 'scheduling:manage',
    },
    {
      file: join(root, 'scheduling/resources/resources.controller.ts'),
      read: 'scheduling:read',
      manage: 'scheduling:manage',
    },
    {
      file: join(root, 'roster/roster.controller.ts'),
      read: 'roster:read',
      manage: 'roster:manage',
    },
    {
      file: join(root, 'booking-rules/booking-rules.controller.ts'),
      read: 'booking-rules:read',
      manage: 'booking-rules:manage',
    },
    {
      file: join(root, 'work-schedules/work-schedules.controller.ts'),
      read: 'work-schedules:read',
      manage: 'work-schedules:manage',
    },
    {
      file: join(root, 'leave/leave.controller.ts'),
      read: 'leave:read',
      manage: 'leave:manage',
    },
  ];

  it.each(controllers)(
    'wires PermissionsGuard and read/manage permissions ($file)',
    ({ file, read, manage }) => {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('PermissionsGuard');
      expect(source).toContain('@RequirePermissions');
      expect(source).toContain(`'${read}'`);
      expect(source).toContain(`'${manage}'`);
      expect(source).toContain('FeatureKey.SCHEDULING');
    },
  );

  it('does not attach staff permissions to portal appointments controller', () => {
    const source = readFileSync(
      join(root, 'portal/portal-appointments/portal-appointments.controller.ts'),
      'utf8',
    );
    expect(source).not.toContain('PermissionsGuard');
    expect(source).not.toContain('@RequirePermissions');
    expect(source).toContain('PortalJwtAuthGuard');
  });
});
