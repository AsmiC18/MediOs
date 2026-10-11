import { PrismaClient } from '@prisma/client';
import { LoginRateLimitService } from '../../auth/login-rate-limit.service';
import { RefreshRateLimitService } from '../../auth/refresh-rate-limit.service';
import { RegistrationRateLimitService } from '../../auth/registration-rate-limit.service';
import { hashRefreshToken } from '../../auth/refresh-token.util';
import { RateLimitExceededException } from './rate-limit-exceeded.exception';
import {
  RATE_LIMIT_SCOPE_LOGIN,
  RATE_LIMIT_SCOPE_REFRESH,
  RATE_LIMIT_SCOPE_REGISTRATION,
} from './rate-limit.scopes';
import { RateLimitStoreService } from './rate-limit-store.service';
import { WebhookRateLimitService } from './webhook-rate-limit.service';

describe('Rate limiting J3 (PostgreSQL store)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;

  const storeA = new RateLimitStoreService(prisma as never);
  const storeB = new RateLimitStoreService(prisma as never);

  const loginA = new LoginRateLimitService(storeA);
  const loginB = new LoginRateLimitService(storeB);

  const refreshA = new RefreshRateLimitService(storeA);
  const refreshB = new RefreshRateLimitService(storeB);

  const registrationA = new RegistrationRateLimitService(storeA);
  const webhookA = new WebhookRateLimitService(storeA);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  const email = `j3-${runId}@test.com`;
  const hospitalId = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.rateLimitBucket.deleteMany({
      where: {
        OR: [
          { scope: RATE_LIMIT_SCOPE_LOGIN },
          { scope: RATE_LIMIT_SCOPE_REFRESH },
          { scope: RATE_LIMIT_SCOPE_REGISTRATION },
        ],
      },
    });
    await prisma.$disconnect();
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  beforeEach(async () => {
    if (!dbAvailable) {
      return;
    }
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '3';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS = '2';
    process.env.REFRESH_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS = '2';
    process.env.REGISTRATION_RATE_LIMIT_WINDOW_MS = '60000';
    await storeA.deleteScope(RATE_LIMIT_SCOPE_LOGIN);
    await storeA.deleteScope(RATE_LIMIT_SCOPE_REFRESH);
    await storeA.deleteScope(RATE_LIMIT_SCOPE_REGISTRATION);
  });

  describe('login', () => {
    itDb('allows attempts below the limit', async () => {
      await loginA.assertAllowed(ip, email);
      await loginA.recordFailedAttempt(ip, email);
      await loginA.assertAllowed(ip, email);
    });

    itDb('returns 429 with Retry-After when limit exceeded', async () => {
      for (let i = 0; i < 3; i += 1) {
        await loginA.recordFailedAttempt(ip, email);
      }

      try {
        await loginA.assertAllowed(ip, email);
        fail('expected rate limit');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitExceededException);
        const rateError = error as RateLimitExceededException;
        expect(rateError.getStatus()).toBe(429);
        expect(rateError.retryAfterSeconds).toBeGreaterThan(0);
      }
    });

    itDb('clears bucket after successful login semantics', async () => {
      for (let i = 0; i < 3; i += 1) {
        await loginA.recordFailedAttempt(ip, email);
      }
      await loginA.clearAttempts(ip, email);
      await expect(loginA.assertAllowed(ip, email)).resolves.toBeUndefined();
    });

    itDb('shares state across two service instances', async () => {
      await loginA.recordFailedAttempt(ip, email);
      await loginB.recordFailedAttempt(ip, email);
      await loginB.recordFailedAttempt(ip, email);

      await expect(loginA.assertAllowed(ip, email)).rejects.toBeInstanceOf(
        RateLimitExceededException,
      );
    });

    itDb('handles concurrent increments without losing updates', async () => {
      const keyEmail = `concurrent-${runId}@test.com`;
      await Promise.all(
        Array.from({ length: 5 }, () =>
          loginA.recordFailedAttempt(ip, keyEmail),
        ),
      );

      const bucket = await storeA.peek(
        RATE_LIMIT_SCOPE_LOGIN,
        `${ip}:${keyEmail.toLowerCase()}`,
      );
      expect(bucket?.count).toBe(5);
    });
  });

  describe('refresh', () => {
    itDb('uses hashed refresh token prefix in bucket key only', async () => {
      const plain = '0123456789abcdef0123456789abcdef';
      const hash = hashRefreshToken(plain);
      await refreshA.recordAttempt(ip, hash);

      const row = await prisma.rateLimitBucket.findFirst({
        where: { scope: RATE_LIMIT_SCOPE_REFRESH },
      });
      expect(row?.bucketKey).toContain(hash.slice(0, 16));
      expect(row?.bucketKey).not.toContain(plain);
    });

    itDb('shares refresh limits across instances', async () => {
      process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS = '1';
      const hash = hashRefreshToken('shared-refresh-token-1234567890ab');
      await refreshA.recordAttempt(ip, hash);
      await expect(refreshB.recordAttempt(ip, hash)).rejects.toBeInstanceOf(
        RateLimitExceededException,
      );
    });
  });

  describe('registration', () => {
    itDb('returns 429 when registration limit exceeded', async () => {
      process.env.REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS = '1';
      await registrationA.recordAttempt(ip, hospitalId);
      await expect(
        registrationA.recordAttempt(ip, hospitalId),
      ).rejects.toBeInstanceOf(RateLimitExceededException);
    });
  });

  describe('webhook ingress', () => {
    itDb('returns 429 for webhook ingress when exceeded', async () => {
      process.env.WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS = '1';
      process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = '60000';
      await webhookA.recordIngress('razorpay', ip);
      await expect(webhookA.recordIngress('razorpay', ip)).rejects.toBeInstanceOf(
        RateLimitExceededException,
      );
    });
  });

  describe('window reset', () => {
    itDb('starts a new window after resetAt passes', async () => {
      const key = `${ip}:window-${runId}@test.com`;
      await storeA.increment(RATE_LIMIT_SCOPE_LOGIN, key, 50);
      await prisma.rateLimitBucket.updateMany({
        where: { scope: RATE_LIMIT_SCOPE_LOGIN, bucketKey: key },
        data: { resetAt: new Date(Date.now() - 1000), count: 99 },
      });

      const state = await storeA.increment(RATE_LIMIT_SCOPE_LOGIN, key, 60_000);
      expect(state.count).toBe(1);
    });
  });
});
