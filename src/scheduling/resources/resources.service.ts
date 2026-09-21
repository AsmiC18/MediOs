import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResourceStatus, ResourceType } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

type ResourceFilters = {
  type?: ResourceType;
  status?: ResourceStatus;
  branchId?: string;
};

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async validateBranch(
    user: AuthenticatedUser,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        'Branch does not belong to your hospital',
      );
    }
  }

  private async findOwnedResource(user: AuthenticatedUser, resourceId: string) {
    const resource = await this.prisma.resource.findUnique({
      where: {
        id: resourceId,
      },
    });

    if (!resource || resource.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Resource not found');
    }

    return resource;
  }

  async create(user: AuthenticatedUser, dto: CreateResourceDto) {
    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
    }

    const resource = await this.prisma.resource.create({
      data: {
        hospitalId: user.hospitalId,
        branchId: dto.branchId,
        type: dto.type,
        name: dto.name,
        description: dto.description,
      },
    });

    await this.auditService.log({
      action: 'RESOURCE_CREATED',
      entity: 'Resource',
      entityId: resource.id,
      hospitalId: user.hospitalId,
      branchId: resource.branchId,
      userId: user.sub,
    });

    return resource;
  }

  async findAll(user: AuthenticatedUser, filters: ResourceFilters = {}) {
    return this.prisma.resource.findMany({
      where: {
        hospitalId: user.hospitalId,
        ...(filters.type !== undefined && { type: filters.type }),
        ...(filters.status !== undefined && { status: filters.status }),
        ...(filters.branchId !== undefined && { branchId: filters.branchId }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(user: AuthenticatedUser, resourceId: string) {
    return this.findOwnedResource(user, resourceId);
  }

  async update(
    user: AuthenticatedUser,
    resourceId: string,
    dto: UpdateResourceDto,
  ) {
    await this.findOwnedResource(user, resourceId);

    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
    }

    const resource = await this.prisma.resource.update({
      where: {
        id: resourceId,
      },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
      },
    });

    await this.auditService.log({
      action: 'RESOURCE_UPDATED',
      entity: 'Resource',
      entityId: resource.id,
      hospitalId: user.hospitalId,
      branchId: resource.branchId,
      userId: user.sub,
    });

    return resource;
  }

  async deactivate(user: AuthenticatedUser, resourceId: string) {
    await this.findOwnedResource(user, resourceId);

    const resource = await this.prisma.resource.update({
      where: {
        id: resourceId,
      },
      data: {
        status: ResourceStatus.INACTIVE,
      },
    });

    await this.auditService.log({
      action: 'RESOURCE_DEACTIVATED',
      entity: 'Resource',
      entityId: resource.id,
      hospitalId: user.hospitalId,
      branchId: resource.branchId,
      userId: user.sub,
    });

    return resource;
  }
}
