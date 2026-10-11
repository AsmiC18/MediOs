import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

describe('Clinical attachments HTTP contract', () => {
  const encounterControllerSource = fs.readFileSync(
    path.join(__dirname, 'clinical-encounter-attachment.controller.ts'),
    'utf8',
  );
  const attachmentControllerSource = fs.readFileSync(
    path.join(__dirname, 'clinical-attachment.controller.ts'),
    'utf8',
  );

  it('registers encounter attachment routes behind JWT and PermissionsGuard', () => {
    expect(encounterControllerSource).toContain("@Controller('clinical/encounters')");
    expect(encounterControllerSource).toContain('JwtAuthGuard');
    expect(encounterControllerSource).toContain('PermissionsGuard');
    expect(encounterControllerSource).toContain('FeatureGuard');
    expect(encounterControllerSource).toContain("@Post(':encounterId/attachments')");
    expect(encounterControllerSource).toContain("@RequirePermissions('clinical:manage')");
    expect(encounterControllerSource).toContain("@Get(':encounterId/attachments')");
    expect(encounterControllerSource).toContain("@RequirePermissions('clinical:read')");
  });

  it('registers attachment content and delete routes with RBAC', () => {
    expect(attachmentControllerSource).toContain("@Controller('clinical/attachments')");
    expect(attachmentControllerSource).toContain('JwtAuthGuard');
    expect(attachmentControllerSource).toContain('PermissionsGuard');
    expect(attachmentControllerSource).toContain('FeatureGuard');
    expect(attachmentControllerSource).toContain("@Get(':attachmentId/content')");
    expect(attachmentControllerSource).toContain("@RequirePermissions('clinical:read')");
    expect(attachmentControllerSource).toContain("@Delete(':attachmentId')");
    expect(attachmentControllerSource).toContain("@RequirePermissions('clinical:manage')");
  });

  it('does not expose storageKey in controller responses (service DTO)', () => {
    const serviceSource = fs.readFileSync(
      path.join(__dirname, 'clinical-attachment.service.ts'),
      'utf8',
    );
    expect(serviceSource).toContain('ClinicalAttachmentMetadataResponse');
    expect(serviceSource).not.toMatch(/storageKey.*return/);
    expect(serviceSource).toMatch(/toMetadataResponse/);
  });
});
