/** Marks a job failure that must not be retried (dead-letter immediately). */
export class JobPermanentFailureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'JobPermanentFailureError';
  }
}
