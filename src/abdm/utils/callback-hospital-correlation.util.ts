import { AbhaLinkStatus } from '@prisma/client';

export type CallbackHospitalCorrelationInput = {
  hipIdHeader?: string | null;
  requestId: string;
  configsForHipId: Array<{ hospitalId: string }>;
  linksForRequestId: Array<{ hospitalId: string; linkStatus: AbhaLinkStatus }>;
};

/**
 * Resolves tenant hospital for an ABDM link-token callback.
 * Prefers trusted HIP ID (gateway header correlated to AbdmHospitalConfig.hipId).
 * Without HIP ID, allows exactly one hospital to have a pending/linked row for the requestId.
 */
export function resolveCallbackHospitalId(
  input: CallbackHospitalCorrelationInput,
): string | null {
  const hipId = input.hipIdHeader?.trim();
  if (hipId) {
    if (input.configsForHipId.length === 1) {
      return input.configsForHipId[0].hospitalId;
    }
    return null;
  }

  const hospitalIds = new Set(
    input.linksForRequestId
      .filter(
        (link) =>
          link.linkStatus === AbhaLinkStatus.LINK_PENDING ||
          link.linkStatus === AbhaLinkStatus.LINKED,
      )
      .map((link) => link.hospitalId),
  );

  if (hospitalIds.size === 1) {
    return [...hospitalIds][0];
  }

  return null;
}
