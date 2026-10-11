import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isProduction } from '../config/app-environment';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitExceededException } from './rate-limit-exceeded.exception';

export type RateLimitBucketState = {
  count: number;
  resetAt: Date;
};

@Injectable()
export class RateLimitStoreService {
  constructor(private readonly prisma: PrismaService) {}

  private handleStoreError(error: unknown): never {
    if (isProduction()) {
      throw new ServiceUnavailableException('Rate limit store unavailable');
    }
    throw error;
  }

  async peek(scope: string, bucketKey: string): Promise<RateLimitBucketState | null> {
    try {
      const row = await this.prisma.rateLimitBucket.findUnique({
        where: {
          scope_bucketKey: { scope, bucketKey },
        },
      });

      if (!row) {
        return null;
      }

      if (row.resetAt.getTime() <= Date.now()) {
        return null;
      }

      return { count: row.count, resetAt: row.resetAt };
    } catch (error) {
      this.handleStoreError(error);
    }
  }

  async assertNotBlocked(
    scope: string,
    bucketKey: string,
    maxAttempts: number,
    blockedMessage: string,
  ): Promise<void> {
    const state = await this.peek(scope, bucketKey);
    if (state && state.count >= maxAttempts) {
      throw new RateLimitExceededException(
        blockedMessage,
        (state.resetAt.getTime() - Date.now()) / 1000,
      );
    }
  }

  async increment(
    scope: string,
    bucketKey: string,
    windowMs: number,
  ): Promise<RateLimitBucketState> {
    const resetAtNew = new Date(Date.now() + windowMs);
    const id = randomUUID();

    try {
      const rows = await this.prisma.$queryRaw<RateLimitBucketState[]>`
        INSERT INTO "RateLimitBucket" ("id", "scope", "bucketKey", "count", "resetAt", "createdAt", "updatedAt")
        VALUES (${id}, ${scope}, ${bucketKey}, 1, ${resetAtNew}, NOW(), NOW())
        ON CONFLICT ("scope", "bucketKey") DO UPDATE SET
          "count" = CASE
            WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
            ELSE "RateLimitBucket"."count" + 1
          END,
          "resetAt" = CASE
            WHEN "RateLimitBucket"."resetAt" <= NOW() THEN ${resetAtNew}
            ELSE "RateLimitBucket"."resetAt"
          END,
          "updatedAt" = NOW()
        RETURNING "count", "resetAt"
      `;

      const row = rows[0];
      if (!row) {
        throw new Error('Rate limit increment returned no row');
      }

      return {
        count: Number(row.count),
        resetAt: row.resetAt instanceof Date ? row.resetAt : new Date(row.resetAt),
      };
    } catch (error) {
      if (error instanceof RateLimitExceededException) {
        throw error;
      }
      this.handleStoreError(error);
    }
  }

  async incrementAndEnforce(
    scope: string,
    bucketKey: string,
    maxAttempts: number,
    windowMs: number,
    blockedMessage: string,
  ): Promise<RateLimitBucketState> {
    const state = await this.increment(scope, bucketKey, windowMs);
    if (state.count > maxAttempts) {
      throw new RateLimitExceededException(
        blockedMessage,
        (state.resetAt.getTime() - Date.now()) / 1000,
      );
    }
    return state;
  }

  async clear(scope: string, bucketKey: string): Promise<void> {
    try {
      await this.prisma.rateLimitBucket.deleteMany({
        where: { scope, bucketKey },
      });
    } catch (error) {
      this.handleStoreError(error);
    }
  }

  async purgeExpired(limit = 5000): Promise<number> {
    try {
      const result = await this.prisma.rateLimitBucket.deleteMany({
        where: {
          resetAt: { lte: new Date() },
        },
        ...(limit > 0 ? {} : {}),
      });
      return result.count;
    } catch (error) {
      this.handleStoreError(error);
    }
  }

  /** @internal tests */
  async deleteScope(scope: string): Promise<void> {
    await this.prisma.rateLimitBucket.deleteMany({ where: { scope } });
  }
}

// Node 22+ global crypto
declare const crypto: { randomUUID(): string };
