import { Injectable } from '@nestjs/common';
import { ReportProjectionType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { REPORTING_READ_LAYER } from './reports-read-layer';

export type ReportProjectionKey = {
  hospitalId: string;
  branchId: string | null;
  reportType: ReportProjectionType;
  periodFrom: Date;
  periodTo: Date;
  scopeKey?: string;
};

export const REPORT_PROJECTION_MAX_AGE_MS = 5 * 60 * 1000;

@Injectable()
export class ReportProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  getReadLayerId(): typeof REPORTING_READ_LAYER {
    return REPORTING_READ_LAYER;
  }

  async getFreshProjection<T>(key: ReportProjectionKey, maxAgeMs: number) {
    const scopeKey = key.scopeKey ?? '';
    const row = await this.prisma.reportProjection.findFirst({
      where: {
        hospitalId: key.hospitalId,
        branchId: key.branchId,
        reportType: key.reportType,
        periodFrom: key.periodFrom,
        periodTo: key.periodTo,
        scopeKey,
      },
    });
    if (!row) {
      return null;
    }
    if (Date.now() - row.computedAt.getTime() > maxAgeMs) {
      return null;
    }
    return row.payload as T;
  }

  async upsertProjection(key: ReportProjectionKey, payload: unknown) {
    const scopeKey = key.scopeKey ?? '';
    const existing = await this.prisma.reportProjection.findFirst({
      where: {
        hospitalId: key.hospitalId,
        branchId: key.branchId,
        reportType: key.reportType,
        periodFrom: key.periodFrom,
        periodTo: key.periodTo,
        scopeKey,
      },
    });
    if (existing) {
      return this.prisma.reportProjection.update({
        where: { id: existing.id },
        data: { payload: payload as object, computedAt: new Date() },
      });
    }
    return this.prisma.reportProjection.create({
      data: {
        hospitalId: key.hospitalId,
        branchId: key.branchId,
        reportType: key.reportType,
        periodFrom: key.periodFrom,
        periodTo: key.periodTo,
        scopeKey,
        payload: payload as object,
      },
    });
  }

  async getOrCompute<T>(
    key: ReportProjectionKey,
    maxAgeMs: number,
    compute: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getFreshProjection<T>(key, maxAgeMs);
    if (cached != null) {
      return cached;
    }
    const data = await compute();
    await this.upsertProjection(key, data);
    return data;
  }
}
