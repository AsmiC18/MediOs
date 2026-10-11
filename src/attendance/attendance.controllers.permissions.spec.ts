import { readFileSync } from 'fs';
import { join } from 'path';

describe('AttendanceController permission metadata', () => {
  const path = join(__dirname, 'attendance.controller.ts');

  it('wires JWT, permissions, and attendance feature', () => {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain(
      '@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)',
    );
    expect(source).toContain('FeatureKey.ATTENDANCE');
  });

  it('requires attendance:manage for clock-in/out', () => {
    const source = readFileSync(path, 'utf8');
    expect(source).toMatch(
      /@Post\('clock-in'\)[\s\S]*@RequirePermissions\('attendance:manage'\)/,
    );
    expect(source).toMatch(
      /@Post\('clock-out'\)[\s\S]*@RequirePermissions\('attendance:manage'\)/,
    );
  });

  it('requires attendance:read for list/detail', () => {
    const source = readFileSync(path, 'utf8');
    expect(source).toMatch(
      /@Get\(\)[\s\S]*@RequirePermissions\('attendance:read'\)/,
    );
    expect(source).toMatch(
      /@Get\(':id'\)[\s\S]*@RequirePermissions\('attendance:read'\)/,
    );
  });

  it('requires attendance:export for payroll export', () => {
    const source = readFileSync(path, 'utf8');
    expect(source).toMatch(
      /@Get\('export\/payroll'\)[\s\S]*@RequirePermissions\('attendance:export'\)/,
    );
  });
});
