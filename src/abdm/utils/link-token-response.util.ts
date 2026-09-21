import { AbdmHttpError } from './abdm-http.util';

export type ParsedLinkTokenCallback = {
  abhaAddress?: string;
  linkToken?: string;
  requestId?: string;
};

export function parseLinkTokenCallbackBody(body: unknown): ParsedLinkTokenCallback {
  if (!body || typeof body !== 'object') {
    throw new AbdmHttpError('Callback body must be a JSON object');
  }

  const record = body as Record<string, unknown>;
  const response =
    record.response && typeof record.response === 'object'
      ? (record.response as Record<string, unknown>)
      : undefined;

  return {
    abhaAddress:
      typeof record.abhaAddress === 'string' ? record.abhaAddress : undefined,
    linkToken: typeof record.linkToken === 'string' ? record.linkToken : undefined,
    requestId:
      typeof response?.requestId === 'string' ? response.requestId : undefined,
  };
}

export function extractLinkTokenExpiry(linkToken: string): Date | null {
  const parts = linkToken.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as { exp?: number };

    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return new Date(payload.exp * 1000);
    }
  } catch {
    return null;
  }

  return null;
}

export function sanitizePatientAbhaLink<T extends Record<string, unknown>>(
  link: T,
): Omit<T, 'linkToken'> {
  const { linkToken: _linkToken, ...safeLink } = link;
  return safeLink;
}
