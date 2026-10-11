import { Injectable, Logger } from '@nestjs/common';
import { Job, PatientWinbackCampaignStatus } from '@prisma/client';
import { JobPermanentFailureError } from '../job-permanent-failure.error';
import { JobExecutionContext } from '../job-handler.types';
import { JOB_TYPES } from '../job-types.constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PatientWinbackService } from '../../engagement/patient-winback.service';
import { WhatsappBroadcastSegmentationService } from '../../engagement/whatsapp-broadcast-segmentation.service';

type PatientWinbackPayload = {
  campaignId?: string;
};

@Injectable()
export class PatientWinbackHandler {
  private readonly logger = new Logger(PatientWinbackHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly winbackService: PatientWinbackService,
    private readonly broadcastSegmentationService: WhatsappBroadcastSegmentationService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.PATIENT_WINBACK) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = job.payload as PatientWinbackPayload;
    const campaignId = payload?.campaignId;
    if (!campaignId) {
      throw new JobPermanentFailureError(
        'patient.winback job requires campaignId',
      );
    }

    const campaign = await this.prisma.patientWinbackCampaign.findFirst({
      where: { id: campaignId, hospitalId: job.hospitalId },
    });

    if (!campaign) {
      throw new JobPermanentFailureError('Win-back campaign not found');
    }

    if (campaign.status === PatientWinbackCampaignStatus.COMPLETED) {
      return;
    }

    const patientIds = await this.winbackService.resolveLapsedPatientIds({
      hospitalId: campaign.hospitalId,
      branchId: campaign.branchId,
    });

    const handoff = await this.prisma.$transaction(async (tx) => {
      const result =
        await this.broadcastSegmentationService.handoffWinbackRecipientsInTransaction(
          tx,
          {
            campaignId: campaign.id,
            hospitalId: campaign.hospitalId,
            branchId: campaign.branchId,
            patientIds,
          },
        );

      await tx.patientWinbackCampaign.update({
        where: { id: campaign.id },
        data: {
          status: PatientWinbackCampaignStatus.COMPLETED,
          recipientCount: result.enqueuedCount,
          completedAt: new Date(),
          metadata: {
            eligibleCount: result.eligiblePatientIds.length,
            skippedOptOutCount: result.skippedOptOutCount,
            skippedConsentCount: result.skippedConsentCount,
            lapsedCandidateCount: patientIds.length,
          },
        },
      });

      return result;
    });

    this.logger.log(
      JSON.stringify({
        event: 'patient_winback_completed',
        jobId: job.id,
        workerId: workerContext.workerId,
        campaignId,
        hospitalId: job.hospitalId,
        enqueuedCount: handoff.enqueuedCount,
      }),
    );
  }
}
