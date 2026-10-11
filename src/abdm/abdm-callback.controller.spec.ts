import { UnauthorizedException } from '@nestjs/common';
import { AbdmCallbackAuthenticationService } from './abdm-callback-authentication.service';
import { AbdmCallbackController } from './abdm-callback.controller';
import { AbdmCallbackService } from './abdm-callback.service';
import { AbdmEnvironmentService } from './abdm-environment.service';

describe('AbdmCallbackController security', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function buildController(options: {
    authImpl?: AbdmCallbackAuthenticationService;
    callbackSecret?: string | null;
  }) {
    const environmentService = {
      getCallbackSecret: () => options.callbackSecret ?? null,
    } as unknown as AbdmEnvironmentService;
    const callbackAuthenticationService =
      options.authImpl ??
      ({
        assertCallbackAuthenticated: jest.fn().mockResolvedValue(undefined),
      } as unknown as AbdmCallbackAuthenticationService);
    const callbackService = {
      handleGenerateTokenCallback: jest.fn().mockResolvedValue({ status: 'linked' }),
    } as unknown as AbdmCallbackService;

    const controller = new AbdmCallbackController(
      callbackAuthenticationService,
      callbackService,
      environmentService,
    );

    return { controller, callbackService, callbackAuthenticationService };
  }

  it('rejects callback when JWT authentication fails', async () => {
    const auth = {
      assertCallbackAuthenticated: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('Invalid ABDM callback JWT signature')),
    } as unknown as AbdmCallbackAuthenticationService;
    const { controller, callbackService } = buildController({ authImpl: auth });

    await expect(controller.onGenerateToken({}, undefined, undefined, 'hip-a')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(callbackService.handleGenerateTokenCallback).not.toHaveBeenCalled();
  });

  it('authenticates before invoking callback service', async () => {
    const auth = {
      assertCallbackAuthenticated: jest.fn().mockResolvedValue(undefined),
    } as unknown as AbdmCallbackAuthenticationService;
    const { controller, callbackService } = buildController({ authImpl: auth });

    await controller.onGenerateToken(
      { response: { requestId: 'r1' }, linkToken: 't' },
      'Bearer jwt',
      undefined,
      'hip-a',
    );

    expect(auth.assertCallbackAuthenticated).toHaveBeenCalledWith({
      authorization: 'Bearer jwt',
    });
    expect(callbackService.handleGenerateTokenCallback).toHaveBeenCalled();
  });

  it('rejects invalid callback secret when configured', async () => {
    const { controller, callbackService } = buildController({
      callbackSecret: 'expected-secret',
    });

    await expect(
      controller.onGenerateToken({}, 'Bearer jwt', 'wrong-secret'),
    ).rejects.toThrow(UnauthorizedException);
    expect(callbackService.handleGenerateTokenCallback).not.toHaveBeenCalled();
  });

  it('accepts valid callback secret after JWT authentication', async () => {
    const { controller, callbackService } = buildController({
      callbackSecret: 'expected-secret',
    });

    await expect(
      controller.onGenerateToken({}, 'Bearer jwt', 'expected-secret', 'hip-a'),
    ).resolves.toEqual({ status: 'linked' });
    expect(callbackService.handleGenerateTokenCallback).toHaveBeenCalledWith(
      expect.anything(),
      { hipId: 'hip-a' },
    );
  });
});
