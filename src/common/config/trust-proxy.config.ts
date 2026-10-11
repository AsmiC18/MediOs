import { parseBooleanEnv } from './app-environment';

/**
 * When true, Express trust proxy is enabled and client IP resolution may use
 * X-Forwarded-For from a trusted reverse proxy. When false, only the direct
 * connection IP (request.ip) is used so clients cannot spoof forwarded headers.
 */
export function isTrustProxyEnabled(): boolean {
  return parseBooleanEnv(process.env.TRUST_PROXY, false);
}
