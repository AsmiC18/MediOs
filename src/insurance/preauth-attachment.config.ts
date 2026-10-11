export function buildInsurancePreauthAttachmentStorageKey(input: {
  hospitalId: string;
  preauthId: string;
  attachmentId: string;
}): string {
  return `hospital/${input.hospitalId}/insurance/pre-authorizations/${input.preauthId}/attachments/${input.attachmentId}`;
}
