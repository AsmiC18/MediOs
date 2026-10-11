import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DrugResolutionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrescriptionItemDto } from '../dto/create-prescription.dto';
import { CreateClinicalDrugDto } from './dto/create-clinical-drug.dto';
import { UpdateClinicalDrugDto } from './dto/update-clinical-drug.dto';
import { ResolvedPrescriptionLine } from '../safety/safety.types';

const drugInclude = {
  ingredients: true,
  formularyEntries: true,
} satisfies Prisma.ClinicalDrugInclude;

@Injectable()
export class ClinicalDrugService {
  constructor(private readonly prisma: PrismaService) {}

  async createDrug(hospitalId: string, dto: CreateClinicalDrugDto) {
    if (dto.defaultPharmacyProductId) {
      await this.validatePharmacyProduct(hospitalId, dto.defaultPharmacyProductId);
    }

    return this.prisma.$transaction(async (tx) => {
      const drug = await tx.clinicalDrug.create({
        data: {
          hospitalId,
          genericName: dto.genericName.trim(),
          brandName: dto.brandName?.trim(),
          strength: dto.strength?.trim(),
          dosageForm: dto.dosageForm?.trim(),
          route: dto.route?.trim(),
          externalConceptId: dto.externalConceptId?.trim(),
          isActive: dto.isActive ?? true,
          ingredients: dto.ingredients?.length
            ? {
                create: dto.ingredients.map((name) => ({
                  hospitalId,
                  ingredientName: name.trim(),
                })),
              }
            : undefined,
        },
        include: drugInclude,
      });

      await tx.hospitalFormularyEntry.create({
        data: {
          hospitalId,
          clinicalDrugId: drug.id,
          isActive: true,
          defaultPharmacyProductId: dto.defaultPharmacyProductId ?? null,
        },
      });

      return tx.clinicalDrug.findUniqueOrThrow({
        where: { id: drug.id },
        include: drugInclude,
      });
    });
  }

  async listDrugs(hospitalId: string, activeOnly?: boolean) {
    return this.prisma.clinicalDrug.findMany({
      where: {
        hospitalId,
        ...(activeOnly === true && { isActive: true }),
      },
      include: drugInclude,
      orderBy: { genericName: 'asc' },
    });
  }

  async getDrug(hospitalId: string, drugId: string) {
    const drug = await this.prisma.clinicalDrug.findUnique({
      where: { id: drugId },
      include: drugInclude,
    });

    if (!drug || drug.hospitalId !== hospitalId) {
      throw new NotFoundException('Clinical drug not found');
    }

    return drug;
  }

  async updateDrug(
    hospitalId: string,
    drugId: string,
    dto: UpdateClinicalDrugDto,
  ) {
    await this.getDrug(hospitalId, drugId);

    if (dto.defaultPharmacyProductId) {
      await this.validatePharmacyProduct(hospitalId, dto.defaultPharmacyProductId);
    }

    return this.prisma.clinicalDrug.update({
      where: { id: drugId },
      data: {
        ...(dto.genericName !== undefined && {
          genericName: dto.genericName.trim(),
        }),
        ...(dto.brandName !== undefined && { brandName: dto.brandName?.trim() }),
        ...(dto.strength !== undefined && { strength: dto.strength?.trim() }),
        ...(dto.dosageForm !== undefined && {
          dosageForm: dto.dosageForm?.trim(),
        }),
        ...(dto.route !== undefined && { route: dto.route?.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.ingredients !== undefined && {
          ingredients: {
            deleteMany: {},
            create: dto.ingredients.map((name) => ({
              hospitalId,
              ingredientName: name.trim(),
            })),
          },
        }),
      },
      include: drugInclude,
    });
  }

  async resolvePrescriptionLines(
    hospitalId: string,
    items: PrescriptionItemDto[],
  ): Promise<ResolvedPrescriptionLine[]> {
    const resolved: ResolvedPrescriptionLine[] = [];

    for (const item of items) {
      if (!item.clinicalDrugId) {
        resolved.push({
          medicationName: item.medicationName.trim(),
          clinicalDrugId: null,
          drugResolutionStatus: DrugResolutionStatus.FREE_TEXT,
          ingredientNames: [],
          dosage: item.dosage,
          route: item.route,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions,
          quantity: item.quantity,
        });
        continue;
      }

      const drug = await this.prisma.clinicalDrug.findUnique({
        where: { id: item.clinicalDrugId },
        include: { ingredients: true, formularyEntries: true },
      });

      if (!drug || drug.hospitalId !== hospitalId) {
        throw new NotFoundException('Clinical drug not found');
      }

      if (!drug.isActive) {
        throw new BadRequestException('Clinical drug is inactive');
      }

      const formulary = drug.formularyEntries.find(
        (entry) => entry.hospitalId === hospitalId && entry.isActive,
      );

      if (!formulary) {
        throw new BadRequestException(
          'Clinical drug is not on the active hospital formulary',
        );
      }

      const displayName =
        item.medicationName?.trim() ||
        [drug.genericName, drug.strength, drug.dosageForm]
          .filter(Boolean)
          .join(' ');

      resolved.push({
        medicationName: displayName,
        clinicalDrugId: drug.id,
        drugResolutionStatus: DrugResolutionStatus.RESOLVED,
        genericName: drug.genericName,
        brandName: drug.brandName,
        ingredientNames: drug.ingredients.map((i) => i.ingredientName),
        dosage: item.dosage,
        route: item.route ?? drug.route ?? undefined,
        frequency: item.frequency,
        duration: item.duration,
        instructions: item.instructions,
        quantity: item.quantity,
      });
    }

    return resolved;
  }

  private async validatePharmacyProduct(hospitalId: string, productId: string) {
    const product = await this.prisma.pharmacyProduct.findUnique({
      where: { id: productId },
    });

    if (!product || product.hospitalId !== hospitalId) {
      throw new NotFoundException('Pharmacy product not found');
    }
  }
}
