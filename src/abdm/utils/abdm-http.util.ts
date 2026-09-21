export class AbdmHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'AbdmHttpError';
  }
}

export async function abdmFetch(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AbdmHttpError('ABDM request timed out');
    }

    throw new AbdmHttpError(
      error instanceof Error ? error.message : 'ABDM network request failed',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseAbdmJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AbdmHttpError('ABDM returned malformed JSON', response.status, text);
  }
}
