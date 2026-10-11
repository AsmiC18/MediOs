import { UnauthorizedException } from '@nestjs/common';
import { AbdmCallbackAuthenticationService } from './abdm-callback-authentication.service';
import { AbdmCertificateService } from './abdm-certificate.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import {
  createAbdmCallbackJwtTestKeyPair,
  signAbdmCallbackTestJwt,
} from './utils/abdm-callback-jwt.test-keys';

describe('AbdmCallbackAuthenticationService', () => {
  const keys = createAbdmCallbackJwtTestKeyPair();
  const futureExp = () => Math.floor(Date.now() / 1000) + 3600;

  function buildService(options: {
    mockMode: boolean;
    publicKey?: string | null;
    useGatewayCerts?: boolean;
    certificatePublicKey?: string;
  }) {
    const environmentService = {
      isMockMode: () => options.mockMode,
      getCallbackJwtPublicKey: () => options.publicKey ?? null,
      useGatewayCertsForCallbackJwt: () => options.useGatewayCerts ?? false,
      getCallbackJwtAlgorithms: () => ['RS256'],
      getCallbackJwtIssuer: () => null,
      getCallbackJwtAudience: () => null,
    } as unknown as AbdmEnvironmentService;

    const certificateService = {
      getPublicKey: jest
        .fn()
        .mockResolvedValue(options.certificatePublicKey ?? keys.publicKeyPem),
    } as unknown as AbdmCertificateService;

    return new AbdmCallbackAuthenticationService(
      environmentService,
      certificateService,
    );
  }

  it('skips verification in mock mode', async () => {
    const service = buildService({ mockMode: true });

    await expect(
      service.assertCallbackAuthenticated({ authorization: undefined }),
    ).resolves.toBeUndefined();
  });

  it('rejects missing bearer token in real mode', async () => {
    const service = buildService({
      mockMode: false,
      publicKey: keys.publicKeyPem,
    });

    await expect(
      service.assertCallbackAuthenticated({ authorization: undefined }),
    ).rejects.toThrow(/missing Authorization bearer JWT/i);
  });

  it('accepts valid JWT in real mode', async () => {
    const service = buildService({
      mockMode: false,
      publicKey: keys.publicKeyPem,
    });
    const token = signAbdmCallbackTestJwt(keys.privateKeyPem, {
      exp: futureExp(),
    });

    await expect(
      service.assertCallbackAuthenticated({
        authorization: `Bearer ${token}`,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid JWT in real mode', async () => {
    const service = buildService({
      mockMode: false,
      publicKey: keys.publicKeyPem,
    });

    await expect(
      service.assertCallbackAuthenticated({
        authorization: 'Bearer not.a.jwt',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('uses gateway certificate public key when configured', async () => {
    const otherKeys = createAbdmCallbackJwtTestKeyPair();
    const service = buildService({
      mockMode: false,
      useGatewayCerts: true,
      certificatePublicKey: otherKeys.publicKeyPem,
    });
    const token = signAbdmCallbackTestJwt(otherKeys.privateKeyPem, {
      exp: futureExp(),
    });

    await expect(
      service.assertCallbackAuthenticated({
        authorization: `Bearer ${token}`,
      }),
    ).resolves.toBeUndefined();
  });
});
