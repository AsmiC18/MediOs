import { JobHandlerRegistry } from './job-handler.registry';
import { Job } from '@prisma/client';

describe('JobHandlerRegistry', () => {
  it('returns undefined for unregistered job types', () => {
    const registry = new JobHandlerRegistry();
    expect(registry.get('unknown.type')).toBeUndefined();
    expect(registry.has('unknown.type')).toBe(false);
  });

  it('returns the registered handler for a job type', async () => {
    const registry = new JobHandlerRegistry();
    const handler = jest.fn().mockResolvedValue(undefined);
    registry.register('worker.test.noop', handler);

    expect(registry.has('worker.test.noop')).toBe(true);
    const resolved = registry.get('worker.test.noop');
    expect(resolved).toBe(handler);

    await resolved!({ type: 'worker.test.noop' } as Job, {
      workerId: 'worker-test',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
