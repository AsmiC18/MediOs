import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RefundsService } from './refunds.service';

@Controller('refunds')
@UseGuards(JwtAuthGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get(':id')
  getRefund(@Request() req: any, @Param('id') id: string) {
    return this.refundsService.getRefund(req.user, id);
  }
}
