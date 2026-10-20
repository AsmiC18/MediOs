jest.mock('../common/config/validate-production-config', () => ({
  validateProductionConfig: jest.fn(),
}));

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: jest.fn(),
  },
}));

jest.mock('./worker.module', () => ({
  WorkerModule: class WorkerModule {},
}));

import { NestFactory } from '@nestjs/core';
import { validateProductionConfig } from '../common/config/validate-production-config';
import { bootstrapWorker } from './bootstrap-worker';

describe('bootstrapWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs production config validation before creating the Nest application context', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const stop = jest.fn().mockResolvedValue(undefined);
    const mockApp = {
      enableShutdownHooks: jest.fn(),
      get: jest.fn().mockReturnValue({ run, stop }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (NestFactory.createApplicationContext as jest.Mock).mockResolvedValue(
      mockApp,
    );

    await bootstrapWorker();

    expect(validateProductionConfig).toHaveBeenCalledTimes(1);
    expect(NestFactory.createApplicationContext).toHaveBeenCalledTimes(1);

    const validateOrder = (validateProductionConfig as jest.Mock).mock
      .invocationCallOrder[0];
    const nestOrder = (NestFactory.createApplicationContext as jest.Mock).mock
      .invocationCallOrder[0];
    expect(validateOrder).toBeLessThan(nestOrder);
  });
});
