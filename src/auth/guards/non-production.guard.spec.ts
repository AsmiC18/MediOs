import { NotFoundException } from '@nestjs/common';
import { NonProductionGuard } from './non-production.guard';

describe('NonProductionGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const guard = new NonProductionGuard();

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('allows access when NODE_ENV is development', () => {
    process.env.NODE_ENV = 'development';
    expect(guard.canActivate()).toBe(true);
  });

  it('allows access when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test';
    expect(guard.canActivate()).toBe(true);
  });

  it('returns 404 when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });
});
