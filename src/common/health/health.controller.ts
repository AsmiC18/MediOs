import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  root() {
    return {
      name: 'medios-backend',
      status: 'ok',
    };
  }

  @Get('health')
  async health() {
    const databaseUp = await this.prisma.isHealthy();

    return {
      status: 'ok',
      service: 'medios-backend',
      database: databaseUp ? 'up' : 'down',
      uptime: process.uptime(),
    };
  }
}
