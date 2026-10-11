import * as fs from 'fs';
import * as path from 'path';

describe('ABDM consent audit endpoint (regression)', () => {
  it('keeps GET abdm/consents/:id/audit-log route separate from AuditLog list', () => {
    const controllerPath = path.join(
      __dirname,
      '..',
      'abdm',
      'abdm-consent.controller.ts',
    );
    const source = fs.readFileSync(controllerPath, 'utf8');

    expect(source).toContain("@Get('abdm/consents/:id/audit-log')");
    expect(source).not.toContain('AuditLogQueryService');
  });
});
