import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  normalizeIcd10Code,
  validateIcd10Code,
} from '../utils/icd10-format.util';
import { Icd10SearchQueryDto } from './dto/icd10-search-query.dto';
import {
  Icd10CodeDto,
  Icd10SearchResponseDto,
} from './dto/icd10-code.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class Icd10Service {
  constructor(private readonly prisma: PrismaService) {}

  toDto(row: {
    code: string;
    description: string;
    isActive: boolean;
  }): Icd10CodeDto {
    return {
      code: row.code,
      description: row.description,
      isActive: row.isActive,
    };
  }

  async findByCode(rawCode: string): Promise<Icd10CodeDto | null> {
    let code: string;
    try {
      code = validateIcd10Code(rawCode);
    } catch {
      return null;
    }

    const row = await this.prisma.icd10Code.findUnique({ where: { code } });
    return row ? this.toDto(row) : null;
  }

  async search(query: Icd10SearchQueryDto): Promise<Icd10SearchResponseDto> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const term = query.q.trim();

    const normalizedCode = normalizeIcd10Code(term);
    const where: Prisma.Icd10CodeWhereInput = {
      OR: [
        { code: { contains: normalizedCode, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ],
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.icd10Code.count({ where }),
      this.prisma.icd10Code.findMany({
        where,
        orderBy: [{ code: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => this.toDto(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async validateActiveCode(
    rawCode: string,
  ): Promise<{ code: string; description: string }> {
    let code: string;
    try {
      code = validateIcd10Code(rawCode);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid ICD-10 code',
      );
    }

    const row = await this.prisma.icd10Code.findUnique({ where: { code } });

    if (!row) {
      throw new BadRequestException(
        'ICD-10 code is not in the master catalogue',
      );
    }

    if (!row.isActive) {
      throw new BadRequestException(
        'ICD-10 code is inactive and cannot be used for diagnoses',
      );
    }

    return { code: row.code, description: row.description };
  }
}
