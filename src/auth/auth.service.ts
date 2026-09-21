import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const hospital = await this.prisma.hospital.findUnique({
      where: {
        id: dto.hospitalId,
      },
    });

    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    const role = await this.prisma.role.findFirst({
      where: {
        id: dto.roleId,
        hospitalId: dto.hospitalId,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (dto.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          hospitalId: dto.hospitalId,
          email: dto.email,
        },
      });

      if (existingUser) {
        throw new ConflictException('Email already registered');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        hospitalId: dto.hospitalId,
        roleId: dto.roleId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
      },
      select: {
        id: true,
        hospitalId: true,
        roleId: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
      },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    const payload = {
      sub: user.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      roleId: user.roleId,
      role: user.role.name,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        hospitalId: user.hospitalId,
        branchId: user.branchId,
        roleId: user.roleId,
        role: user.role.name,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
      },
    };
  }
}
