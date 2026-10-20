const DEFAULT_MAX_ERROR_LENGTH = 500;
const DEFAULT_MAX_STACK_LENGTH = 2_000;
const MAX_AGGREGATE_NESTED_ERRORS = 10;

const DATABASE_URL_INLINE = /postgres(?:ql)?:\/\/[^\s'"]+/gi;

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

function redactJobErrorText(value: string): string {
  return value.replace(DATABASE_URL_INLINE, '[REDACTED_DATABASE_URL]');
}

function getErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim() !== '') {
    return code;
  }
  return undefined;
}

function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.constructor.name;
  }
  if (error !== null && typeof error === 'object') {
    const name = (error as { constructor?: { name?: string } }).constructor?.name;
    if (name && name !== 'Object') {
      return name;
    }
  }
  return typeof error;
}

function resolveJobErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    if (error.message.trim() !== '') {
      return error.message;
    }
    const nestedMessages = error.errors
      .map((entry) => resolveJobErrorMessage(entry))
      .filter((message) => message.trim() !== '');
    if (nestedMessages.length > 0) {
      return nestedMessages.join('; ');
    }
    return error.name || 'AggregateError';
  }

  if (error instanceof Error) {
    if (error.message.trim() !== '') {
      return error.message;
    }
    const code = getErrorCode(error);
    if (code) {
      return `${error.name || 'Error'}: ${code}`;
    }
    return error.name || 'Error';
  }

  if (error === undefined) {
    return 'undefined';
  }
  if (error === null) {
    return 'null';
  }

  const asString = String(error);
  if (asString !== '[object Object]') {
    return asString;
  }
  return 'Unknown error';
}

export type JobErrorNestedLogDetails = {
  errorType: string;
  message: string;
  code?: string;
};

export type JobErrorLogDetails = {
  errorType: string;
  message: string;
  code?: string;
  nestedErrors?: JobErrorNestedLogDetails[];
  stack?: string;
};

export type SerializeJobErrorForLogOptions = {
  maxMessageLength?: number;
  maxStackLength?: number;
};

export function truncateJobError(
  error: unknown,
  maxLength = DEFAULT_MAX_ERROR_LENGTH,
): string {
  const message = redactJobErrorText(resolveJobErrorMessage(error));
  return truncate(message, maxLength);
}

/** Structured, redacted error fields for scheduler and job diagnostics. */
export function serializeJobErrorForLog(
  error: unknown,
  options?: SerializeJobErrorForLogOptions,
): JobErrorLogDetails {
  const maxMessageLength =
    options?.maxMessageLength ?? DEFAULT_MAX_ERROR_LENGTH;
  const maxStackLength = options?.maxStackLength ?? DEFAULT_MAX_STACK_LENGTH;

  const errorType = getErrorType(error);
  const message = truncate(
    redactJobErrorText(resolveJobErrorMessage(error)),
    maxMessageLength,
  );
  const code = getErrorCode(error);

  let nestedErrors: JobErrorNestedLogDetails[] | undefined;
  if (error instanceof AggregateError && error.errors.length > 0) {
    nestedErrors = error.errors
      .slice(0, MAX_AGGREGATE_NESTED_ERRORS)
      .map((entry) => ({
        errorType: getErrorType(entry),
        message: truncate(
          redactJobErrorText(resolveJobErrorMessage(entry)),
          maxMessageLength,
        ),
        ...(getErrorCode(entry) ? { code: getErrorCode(entry) } : {}),
      }));
  }

  let stack: string | undefined;
  if (error instanceof Error && typeof error.stack === 'string') {
    stack = truncate(redactJobErrorText(error.stack), maxStackLength);
  }

  return {
    errorType,
    message,
    ...(code ? { code } : {}),
    ...(nestedErrors ? { nestedErrors } : {}),
    ...(stack ? { stack } : {}),
  };
}
