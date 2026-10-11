import {
  escapeCsvCell,
  neutralizeCsvFormulaInjection,
  serializeAuditLogsToCsv,
} from './audit-log-csv.util';
import { AuditLogListItemDto } from './dto/audit-log-response.dto';

describe('audit-log CSV serialization', () => {
  const sampleRow = (overrides: Partial<AuditLogListItemDto> = {}): AuditLogListItemDto => ({
    id: '11111111-1111-4111-8111-111111111111',
    hospitalId: '22222222-2222-4222-8222-222222222222',
    branchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    actorUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    action: 'PATIENT_UPDATED',
    entity: 'Patient',
    entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    ...overrides,
  });

  it('includes correct headers', () => {
    const csv = serializeAuditLogsToCsv([]);
    expect(csv.split('\r\n')[0]).toBe(
      'id,hospitalId,branchId,actorUserId,action,entity,entityId,createdAt',
    );
  });

  it('quotes fields containing commas', () => {
    const csv = serializeAuditLogsToCsv([
      sampleRow({ action: 'ACTION,WITH,COMMAS' }),
    ]);
    expect(csv).toContain('"ACTION,WITH,COMMAS"');
  });

  it('escapes embedded double quotes', () => {
    const csv = serializeAuditLogsToCsv([
      sampleRow({ entity: 'Entity "quoted"' }),
    ]);
    expect(csv).toContain('"Entity ""quoted"""');
  });

  it('quotes fields containing newlines', () => {
    const csv = serializeAuditLogsToCsv([
      sampleRow({ action: 'LINE1\nLINE2' }),
    ]);
    expect(csv).toContain('"LINE1\nLINE2"');
  });

  it('protects formula injection for = prefix', () => {
    expect(neutralizeCsvFormulaInjection('=1+1')).toBe("'=1+1");
    const csv = serializeAuditLogsToCsv([sampleRow({ action: '=CMD' })]);
    expect(csv).toContain("'=CMD");
  });

  it('protects formula injection for + - @ prefixes', () => {
    expect(neutralizeCsvFormulaInjection('+123')).toBe("'+123");
    expect(neutralizeCsvFormulaInjection('-123')).toBe("'-123");
    expect(neutralizeCsvFormulaInjection('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('does not alter safe values', () => {
    expect(escapeCsvCell('PATIENT_UPDATED')).toBe('PATIENT_UPDATED');
  });
});
