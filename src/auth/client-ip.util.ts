import { isTrustProxyEnabled } from '../common/config/trust-proxy.config';

export function resolveClientIp(request: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const trustProxy = isTrustProxyEnabled();

  if (trustProxy) {
    const forwarded = request.headers?.['x-forwarded-for'];
    const forwardedIp =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : Array.isArray(forwarded)
          ? forwarded[0]?.split(',')[0]?.trim()
          : undefined;

    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return request.ip || 'unknown';
}
