import { AuditService } from './audit.service';

describe('AuditService.log (regression)', () => {
  it('creates audit rows with unchanged writer contract', async () => {
    const prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };
    const service = new AuditService(prisma as never);

    await service.log({
      hospitalId: '11111111-1111-4111-8111-111111111111',
      branchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: 'user-1',
      action: 'PATIENT_UPDATED',
      entity: 'Patient',
      entityId: 'patient-1',
      metadata: { field: 'phone' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        hospitalId: '11111111-1111-4111-8111-111111111111',
        branchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: 'user-1',
        action: 'PATIENT_UPDATED',
        entity: 'Patient',
        entityId: 'patient-1',
        metadata: { field: 'phone' },
      },
    });
  });

  it('sanitizes sensitive metadata before persist', async () => {
    const prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-2' }),
      },
    };
    const service = new AuditService(prisma as never);

    await service.log({
      hospitalId: '11111111-1111-4111-8111-111111111111',
      action: 'TEST',
      entity: 'Test',
      metadata: { accessToken: 'secret', patientId: 'p-1' },
    });

    expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toEqual({
      accessToken: '[REDACTED]',
      patientId: 'p-1',
    });
  });
});
