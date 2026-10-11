export type RazorpayErrorKind = 'permanent' | 'ambiguous' | 'retryable';

/** Read-only provider fetch/list errors (never `ambiguous` / SUBMIT_UNCERTAIN). */
export type RazorpayReadErrorKind = 'retryable' | 'permanent' | 'not_found';

export class RazorpayError extends Error {
  readonly kind: RazorpayErrorKind;
  readonly httpStatus?: number;
  readonly providerCode?: string;

  constructor(
    kind: RazorpayErrorKind,
    message: string,
    options?: { httpStatus?: number; providerCode?: string; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'RazorpayError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.providerCode = options?.providerCode;
  }
}

export class RazorpayReadError extends Error {
  readonly kind: RazorpayReadErrorKind;
  readonly httpStatus?: number;
  readonly providerCode?: string;

  constructor(
    kind: RazorpayReadErrorKind,
    message: string,
    options?: { httpStatus?: number; providerCode?: string; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'RazorpayReadError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.providerCode = options?.providerCode;
  }
}

/** Classify HTTP status for mutating Razorpay calls. */
export function classifyRazorpayHttpStatus(status: number): RazorpayErrorKind {
  if (status === 429 || status >= 500) {
    return 'ambiguous';
  }
  if (status >= 400 && status < 500) {
    return 'permanent';
  }
  return 'ambiguous';
}

/** Classify HTTP status for read-only Razorpay fetches (safe to retry job later). */
export function classifyRazorpayReadHttpStatus(
  status: number,
): RazorpayReadErrorKind {
  if (status === 404) {
    return 'not_found';
  }
  if (status === 429 || status >= 500) {
    return 'retryable';
  }
  if (status >= 400 && status < 500) {
    return 'permanent';
  }
  return 'retryable';
}

export function mapProviderError(error: unknown): RazorpayError {
  if (error instanceof RazorpayError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.name === 'TimeoutError') {
      return new RazorpayError('ambiguous', 'Razorpay API request timed out', {
        cause: error,
      });
    }

    const statusCode = extractHttpStatus(error);
    if (statusCode != null) {
      return new RazorpayError(
        classifyRazorpayHttpStatus(statusCode),
        error.message || `Razorpay API HTTP ${statusCode}`,
        { httpStatus: statusCode, cause: error },
      );
    }

    return new RazorpayError('ambiguous', error.message || 'Razorpay API network error', {
      cause: error,
    });
  }

  const statusCode = extractHttpStatusFromRecord(error);
  if (statusCode != null) {
    return new RazorpayError(
      classifyRazorpayHttpStatus(statusCode),
      `Razorpay API HTTP ${statusCode}`,
      { httpStatus: statusCode, cause: error },
    );
  }

  return new RazorpayError('ambiguous', 'Razorpay API request failed');
}

export function mapReadProviderError(error: unknown): RazorpayReadError {
  if (error instanceof RazorpayReadError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.name === 'TimeoutError') {
      return new RazorpayReadError('retryable', 'Razorpay API request timed out', {
        cause: error,
      });
    }

    const statusCode = extractHttpStatus(error);
    if (statusCode != null) {
      return new RazorpayReadError(
        classifyRazorpayReadHttpStatus(statusCode),
        error.message || `Razorpay API HTTP ${statusCode}`,
        { httpStatus: statusCode, cause: error },
      );
    }

    return new RazorpayReadError(
      'retryable',
      error.message || 'Razorpay API network error',
      { cause: error },
    );
  }

  const statusCode = extractHttpStatusFromRecord(error);
  if (statusCode != null) {
    return new RazorpayReadError(
      classifyRazorpayReadHttpStatus(statusCode),
      `Razorpay API HTTP ${statusCode}`,
      { httpStatus: statusCode, cause: error },
    );
  }

  return new RazorpayReadError('retryable', 'Razorpay API request failed', {
    cause: error,
  });
}

function extractHttpStatus(error: Error): number | undefined {
  const record = error as Error & {
    statusCode?: number;
    status?: number;
    error?: { statusCode?: number };
  };
  if (typeof record.statusCode === 'number') {
    return record.statusCode;
  }
  if (typeof record.status === 'number') {
    return record.status;
  }
  if (typeof record.error?.statusCode === 'number') {
    return record.error.statusCode;
  }
  return undefined;
}

function extractHttpStatusFromRecord(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const record = error as {
    statusCode?: number | string;
    status?: number | string;
    error?: { statusCode?: number | string };
  };
  if (typeof record.statusCode === 'number') {
    return record.statusCode;
  }
  if (typeof record.statusCode === 'string') {
    const parsed = Number.parseInt(record.statusCode, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof record.status === 'number') {
    return record.status;
  }
  if (typeof record.error?.statusCode === 'number') {
    return record.error.statusCode;
  }
  return undefined;
}
