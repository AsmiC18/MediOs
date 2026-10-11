import { Job } from '@prisma/client';
import { PatientsService } from '../../patients/patients.service';
import { JOB_TYPES } from '../job-types.constants';
import { PatientAtRiskEvaluateHandler } from './patient-at-risk-evaluate.handler';

describe('PatientAtRiskEvaluateHandler', () => {
  it('delegates to hospital-wide system evaluation with worker context', async () => {
    const patientsService = {
      evaluateHospitalPatientsAtRiskForSystemJob: jest
        .fn()
        .mockResolvedValue({ evaluatedCount: 3, atRiskCount: 1 }),
    };
    const handler = new PatientAtRiskEvaluateHandler(
      patientsService as unknown as PatientsService,
    );

    const job = {
      id: 'job-1',
      type: JOB_TYPES.PATIENT_AT_RISK_EVALUATE,
      hospitalId: 'hospital-1',
      branchId: null,
    } as Job;

    const result = await handler.handle(job, { workerId: 'worker-1' });

    expect(result).toEqual({ evaluatedCount: 3, atRiskCount: 1 });
    expect(
      patientsService.evaluateHospitalPatientsAtRiskForSystemJob,
    ).toHaveBeenCalledWith({
      jobId: 'job-1',
      jobType: JOB_TYPES.PATIENT_AT_RISK_EVALUATE,
      workerId: 'worker-1',
      hospitalId: 'hospital-1',
      branchId: null,
    });
  });

  it('rejects unexpected job types', async () => {
    const handler = new PatientAtRiskEvaluateHandler({} as PatientsService);

    await expect(
      handler.handle(
        {
          id: 'j',
          type: JOB_TYPES.ABDM_CONSENT_EXPIRE,
          hospitalId: 'h1',
        } as Job,
        { workerId: 'w' },
      ),
    ).rejects.toThrow(/Unexpected job type/);
  });

  it('propagates evaluation errors for worker retry', async () => {
    const patientsService = {
      evaluateHospitalPatientsAtRiskForSystemJob: jest
        .fn()
        .mockRejectedValue(new Error('db failure')),
    };
    const handler = new PatientAtRiskEvaluateHandler(
      patientsService as unknown as PatientsService,
    );

    await expect(
      handler.handle(
        {
          id: 'job-1',
          type: JOB_TYPES.PATIENT_AT_RISK_EVALUATE,
          hospitalId: 'hospital-1',
          branchId: null,
        } as Job,
        { workerId: 'worker-1' },
      ),
    ).rejects.toThrow('db failure');
  });
});
