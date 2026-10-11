import { BadRequestException } from '@nestjs/common';
import { AuditLogExportService } from './audit-log-export.service';
import { AuditLogQueryService } from './audit-log.service';
import { AuditService } from './audit.service';
import {
  AuditLogExportDto,
  AuditLogExportFormat,
} from './dto/audit-log-export.dto';
import { AUDIT_LOG_EXPORT_MAX_ROWS } from './audit-log.types';

describe('AuditLogExportService', () => {
  const hospitalA = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const hospitalWideUser = {
    sub: 'admin-1',
    hospitalId: hospitalA,
    branchId: null as string | null,
  };

  const branchUser = {
    sub: 'branch-user',
    hospitalId: hospitalA,
    branchId: branchA,
  };

  const sampleRow = {
    id: 'log-1',
    hospitalId: hospitalA,
    branchId: branchA,
    actorUserId: 'actor-1',
    action: 'PATIENT_UPDATED',
    entity: 'Patient',
    entityId: 'patient-1',
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
  };

  let queryService: {
    fetchAllForExport: jest.Mock;
    buildAuthorizedWhere: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: AuditLogExportService;

  beforeEach(() => {
    queryService = {
      fetchAllForExport: jest.fn(),
      buildAuthorizedWhere: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    service = new AuditLogExportService(
      queryService as unknown as AuditLogQueryService,
      auditService as unknown as AuditService,
    );
  });

  const baseDto: AuditLogExportDto = {
    format: AuditLogExportFormat.JSON,
  };

  it('requires export to stay within row limit (5001 fails)', async () => {
    queryService.fetchAllForExport.mockResolvedValue({
      total: AUDIT_LOG_EXPORT_MAX_ROWS + 1,
      rows: [],
    });

    await expect(service.export(hospitalWideUser, baseDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('allows exactly 5000 rows', async () => {
    const rows = Array.from({ length: AUDIT_LOG_EXPORT_MAX_ROWS }, (_, i) => ({
      ...sampleRow,
      id: `log-${i}`,
    }));
    queryService.fetchAllForExport.mockResolvedValue({
      total: AUDIT_LOG_EXPORT_MAX_ROWS,
      rows,
    });

    const result = await service.export(hospitalWideUser, {
      ...baseDto,
      format: AuditLogExportFormat.JSON,
    });

    expect(result.type).toBe('json');
    if (result.type === 'json') {
      expect(result.body.data).toHaveLength(AUDIT_LOG_EXPORT_MAX_ROWS);
    }
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it('returns JSON without metadata fields', async () => {
    queryService.fetchAllForExport.mockResolvedValue({
      total: 1,
      rows: [sampleRow],
    });

    const result = await service.export(hospitalWideUser, {
      format: AuditLogExportFormat.JSON,
      action: 'PATIENT_UPDATED',
    });

    expect(result).toEqual({
      type: 'json',
      body: {
        data: [sampleRow],
      },
    });
    expect(result.type === 'json' && result.body.data[0]).not.toHaveProperty(
      'metadata',
    );
  });

  it('returns CSV with attachment filename pattern', async () => {
    queryService.fetchAllForExport.mockResolvedValue({
      total: 1,
      rows: [sampleRow],
    });

    const result = await service.export(hospitalWideUser, {
      format: AuditLogExportFormat.CSV,
    });

    expect(result.type).toBe('csv');
    if (result.type === 'csv') {
      expect(result.filename).toMatch(/^audit-logs-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.body).toContain('PATIENT_UPDATED');
      expect(result.body).not.toContain('metadata');
    }
  });

  it('passes filters to shared query service (AND filters)', async () => {
    queryService.fetchAllForExport.mockResolvedValue({ total: 0, rows: [] });

    await service.export(hospitalWideUser, {
      format: AuditLogExportFormat.JSON,
      action: 'X',
      entity: 'Patient',
      userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });

    expect(queryService.fetchAllForExport).toHaveBeenCalledWith(
      hospitalWideUser,
      expect.objectContaining({
        action: 'X',
        entity: 'Patient',
        userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
      }),
      AUDIT_LOG_EXPORT_MAX_ROWS,
    );
  });

  it('uses tenant user for fetch (not client hospitalId)', async () => {
    queryService.fetchAllForExport.mockResolvedValue({ total: 0, rows: [] });

    await service.export(branchUser, { format: AuditLogExportFormat.JSON });

    expect(queryService.fetchAllForExport.mock.calls[0][0].hospitalId).toBe(
      hospitalA,
    );
  });

  it('records AUDIT_LOG_EXPORTED only after successful export', async () => {
    queryService.fetchAllForExport.mockResolvedValue({
      total: 2,
      rows: [sampleRow, { ...sampleRow, id: 'log-2' }],
    });

    await service.export(hospitalWideUser, {
      format: AuditLogExportFormat.CSV,
      branchId: branchA,
      action: 'PATIENT_UPDATED',
    });

    expect(auditService.log).toHaveBeenCalledWith({
      action: 'AUDIT_LOG_EXPORTED',
      entity: 'AuditLog',
      entityId: null,
      hospitalId: hospitalA,
      branchId: branchA,
      userId: 'admin-1',
      metadata: {
        format: 'csv',
        filterSummary: {
          branchId: branchA,
          action: 'PATIENT_UPDATED',
        },
        resultCount: 2,
      },
    });
    const metadata = auditService.log.mock.calls[0][0].metadata;
    expect(metadata).not.toHaveProperty('rows');
    expect(JSON.stringify(metadata)).not.toContain('log-1');
  });

  it('does not record audit when export generation would fail on limit', async () => {
    queryService.fetchAllForExport.mockResolvedValue({
      total: 5001,
      rows: [],
    });

    await expect(
      service.export(hospitalWideUser, { format: AuditLogExportFormat.CSV }),
    ).rejects.toThrow(BadRequestException);

    expect(auditService.log).not.toHaveBeenCalled();
  });
});
