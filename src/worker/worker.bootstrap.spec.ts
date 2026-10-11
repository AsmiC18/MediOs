jest.mock('./worker.module', () => ({
  WorkerModule: class WorkerModule {},
}));

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: jest.fn(),
    create: jest.fn(),
  },
}));

import { NestFactory } from '@nestjs/core';
import { bootstrapWorker } from './bootstrap-worker';

describe('worker bootstrap', () => {
  const run = jest.fn().mockResolvedValue(undefined);
  const stop = jest.fn().mockResolvedValue(undefined);
  const close = jest.fn().mockResolvedValue(undefined);
  const enableShutdownHooks = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (NestFactory.createApplicationContext as jest.Mock).mockResolvedValue({
      enableShutdownHooks,
      get: jest.fn().mockReturnValue({ run, stop }),
      close,
    });
  });

  it('starts a Nest application context without an HTTP listener', async () => {
    await bootstrapWorker();

    expect(NestFactory.createApplicationContext).toHaveBeenCalledTimes(1);
    expect(NestFactory.create).not.toHaveBeenCalled();
    expect(enableShutdownHooks).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });
});
