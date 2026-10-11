import { AppointmentsService } from './appointments.service';

describe('AppointmentsService sensitive read audits', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const user = { sub: 'user-1', hospitalId, branchId };
  const appointmentId = 'appt-1';

  let auditService: { log: jest.Mock };
  let prisma: Record<string, unknown>;
  let service: AppointmentsService;

  beforeEach(() => {
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue({
          id: appointmentId,
          hospitalId,
          branchId,
          patientId: 'pat-1',
          startAt: new Date(),
          endAt: new Date(),
          status: 'BOOKED',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      patient: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pat-1',
          hospitalId,
          branchId,
          mergedIntoPatientId: null,
        }),
      },
      branch: { findUnique: jest.fn() },
    };
    service = new AppointmentsService(
      prisma as never,
      auditService as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('audits single appointment read', async () => {
    await service.findOne(user, appointmentId);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPOINTMENT_READ',
        entityId: appointmentId,
      }),
    );
  });

  it('audits appointment list read', async () => {
    await service.findAll(user, { patientId: 'pat-1' });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPOINTMENT_LIST_READ',
        metadata: expect.objectContaining({ patientId: 'pat-1' }),
      }),
    );
  });
});
