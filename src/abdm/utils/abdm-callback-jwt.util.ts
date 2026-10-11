import { UnauthorizedException } from '@nestjs/common';
import { createPublicKey, verify } from 'crypto';

export type CallbackJwtVerifyOptions = {
  algorithms: string[];
  issuer?: string | null;
  audience?: string | null;
  nowMs?: number;
};

export function extractBearerAuthorization(
  authorizationHeader?: string | null,
): string | null {
  if (!authorizationHeader?.trim()) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match?.[1]?.trim()) {
    return null;
  }

  return match[1].trim();
}

function decodeJsonBase64Url(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new UnauthorizedException('Invalid ABDM callback JWT encoding');
  }
}

function assertJwtNotExpired(payload: Record<string, unknown>, nowMs: number): void {
  const exp = payload.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    throw new UnauthorizedException('ABDM callback JWT missing exp claim');
  }

  if (nowMs >= exp * 1000) {
    throw new UnauthorizedException('ABDM callback JWT has expired');
  }
}

function assertJwtIssuerAudience(
  payload: Record<string, unknown>,
  options: CallbackJwtVerifyOptions,
): void {
  if (options.issuer) {
    if (payload.iss !== options.issuer) {
      throw new UnauthorizedException('ABDM callback JWT issuer mismatch');
    }
  }

  if (options.audience) {
    const aud = payload.aud;
    const allowed = Array.isArray(aud)
      ? aud.includes(options.audience)
      : aud === options.audience;

    if (!allowed) {
      throw new UnauthorizedException('ABDM callback JWT audience mismatch');
    }
  }
}

/**
 * Verifies an ABDM gateway-style RS256 JWT using a configured public key PEM.
 * Does not log or persist the token.
 */
export function verifyAbdmCallbackJwt(
  token: string,
  publicKeyPem: string,
  options: CallbackJwtVerifyOptions,
): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('Invalid ABDM callback JWT format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonBase64Url(encodedHeader) as Record<string, unknown>;
  const payload = decodeJsonBase64Url(encodedPayload) as Record<string, unknown>;

  const algorithm = typeof header.alg === 'string' ? header.alg : null;
  if (!algorithm || !options.algorithms.includes(algorithm)) {
    throw new UnauthorizedException('ABDM callback JWT uses unsupported algorithm');
  }

  if (algorithm !== 'RS256') {
    throw new UnauthorizedException('ABDM callback JWT uses unsupported algorithm');
  }

  const nowMs = options.nowMs ?? Date.now();
  assertJwtNotExpired(payload, nowMs);
  assertJwtIssuerAudience(payload, options);

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = Buffer.from(encodedSignature, 'base64url');

  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    throw new UnauthorizedException('ABDM callback JWT verification key is invalid');
  }

  const valid = verify('RSA-SHA256', Buffer.from(signingInput), key, signature);
  if (!valid) {
    throw new UnauthorizedException('Invalid ABDM callback JWT signature');
  }

  return payload;
}
