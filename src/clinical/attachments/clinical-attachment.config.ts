const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export function getClinicalStorageLocalRoot(): string {
  const root = process.env.CLINICAL_STORAGE_LOCAL_ROOT?.trim();
  if (!root) {
    throw new Error(
      'CLINICAL_STORAGE_LOCAL_ROOT is required for local clinical attachment storage',
    );
  }
  return root;
}

export function getClinicalStorageMaxFileSizeBytes(): number {
  const raw = process.env.CLINICAL_STORAGE_MAX_FILE_SIZE_BYTES?.trim();
  if (!raw) {
    return DEFAULT_MAX_FILE_SIZE_BYTES;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      'CLINICAL_STORAGE_MAX_FILE_SIZE_BYTES must be a positive integer',
    );
  }
  return parsed;
}

export function buildClinicalAttachmentStorageKey(input: {
  hospitalId: string;
  encounterId: string;
  attachmentId: string;
}): string {
  return `hospital/${input.hospitalId}/clinical/encounters/${input.encounterId}/attachments/${input.attachmentId}`;
}
