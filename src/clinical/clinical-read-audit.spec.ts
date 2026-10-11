import { ClinicalService } from './clinical.service';

describe('ClinicalService sensitive read audits', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const user = { sub: 'user-1', hospitalId, branchId };
  const encounterId = 'enc-1';
  const patientId = 'pat-1';
  const prescriptionId = 'rx-1';

  let auditService: { log: jest.Mock };
  let prisma: Record<string, unknown>;
  let service: ClinicalService;

  beforeEach(() => {
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      clinicalEncounter: {
        findUnique: jest.fn().mockResolvedValue({
          id: encounterId,
          hospitalId,
          branchId,
          patientId,
          status: 'IN_PROGRESS',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      clinicalSoapNote: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'soap-1',
          hospitalId,
          encounterId,
        }),
      },
      clinicalDiagnosis: { findMany: jest.fn().mockResolvedValue([]) },
      prescription: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: prescriptionId,
          hospitalId,
          patientId,
          encounterId,
          encounter: { branchId },
          items: [],
        }),
      },
      patient: {
        findUnique: jest.fn().mockResolvedValue({
          id: patientId,
          hospitalId,
          branchId,
          mergedIntoPatientId: null,
        }),
      },
    };
    service = new ClinicalService(
      prisma as never,
      auditService as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('audits SOAP read', async () => {
    await service.getSoap(user, encounterId);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLINICAL_SOAP_READ', entityId: encounterId }),
    );
  });

  it('audits prescription read', async () => {
    await service.getPrescription(user, prescriptionId);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLINICAL_PRESCRIPTION_READ',
        entityId: prescriptionId,
      }),
    );
  });

  it('audits encounter list read for hospital scope', async () => {
    await service.listEncounters(user);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLINICAL_ENCOUNTER_LIST_READ',
        metadata: expect.objectContaining({ scope: 'hospital' }),
      }),
    );
  });
});
