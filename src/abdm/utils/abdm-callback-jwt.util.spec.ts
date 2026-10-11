import { UnauthorizedException } from '@nestjs/common';
import {
  createAbdmCallbackJwtTestKeyPair,
  signAbdmCallbackTestJwt,
} from './abdm-callback-jwt.test-keys';
import {
  extractBearerAuthorization,
  verifyAbdmCallbackJwt,
} from './abdm-callback-jwt.util';

describe('abdm-callback-jwt.util', () => {
  const keys = createAbdmCallbackJwtTestKeyPair();
  const nowMs = 1_700_000_000_000;

  it('extracts bearer token', () => {
    expect(extractBearerAuthorization('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerAuthorization(undefined)).toBeNull();
  });

  it('accepts valid RS256 JWT', () => {
    const token = signAbdmCallbackTestJwt(keys.privateKeyPem, {
      iss: 'abdm-gateway',
      aud: 'hip-callback',
      exp: Math.floor(nowMs / 1000) + 300,
    });

    const payload = verifyAbdmCallbackJwt(token, keys.publicKeyPem, {
      algorithms: ['RS256'],
      issuer: 'abdm-gateway',
      audience: 'hip-callback',
      nowMs,
    });

    expect(payload.iss).toBe('abdm-gateway');
  });

  it('rejects invalid signature', () => {
    const otherKeys = createAbdmCallbackJwtTestKeyPair();
    const token = signAbdmCallbackTestJwt(otherKeys.privateKeyPem, {
      exp: Math.floor(nowMs / 1000) + 300,
    });

    expect(() =>
      verifyAbdmCallbackJwt(token, keys.publicKeyPem, {
        algorithms: ['RS256'],
        nowMs,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects expired JWT', () => {
    const token = signAbdmCallbackTestJwt(keys.privateKeyPem, {
      exp: Math.floor(nowMs / 1000) - 60,
    });

    expect(() =>
      verifyAbdmCallbackJwt(token, keys.publicKeyPem, {
        algorithms: ['RS256'],
        nowMs,
      }),
    ).toThrow(/expired/i);
  });

  it('rejects issuer and audience mismatch when configured', () => {
    const token = signAbdmCallbackTestJwt(keys.privateKeyPem, {
      iss: 'wrong',
      aud: 'wrong',
      exp: Math.floor(nowMs / 1000) + 300,
    });

    expect(() =>
      verifyAbdmCallbackJwt(token, keys.publicKeyPem, {
        algorithms: ['RS256'],
        issuer: 'abdm-gateway',
        audience: 'hip-callback',
        nowMs,
      }),
    ).toThrow(UnauthorizedException);
  });
});
