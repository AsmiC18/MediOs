import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { PortalJwtAuthGuard } from '../portal-auth/guards/portal-jwt-auth.guard';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { PatientPrincipal } from '../portal.types';
import { PortalInvoiceQueryDto } from './dto/portal-invoice-query.dto';
import { PortalBillingService } from './portal-billing.service';

@Controller('portal')
@UseGuards(PortalJwtAuthGuard, PortalPrincipalGuard, FeatureGuard)
@RequireFeature(FeatureKey.PATIENT_PORTAL)
export class PortalBillingController {
  constructor(private readonly portalBillingService: PortalBillingService) {}

  @Get('invoices')
  listInvoices(
    @Request() req: { user: PatientPrincipal },
    @Query() query: PortalInvoiceQueryDto,
  ) {
    return this.portalBillingService.listInvoices(req.user, query);
  }

  @Get('invoices/:id')
  getInvoice(
    @Request() req: { user: PatientPrincipal },
    @Param('id') id: string,
  ) {
    return this.portalBillingService.getInvoice(req.user, id);
  }

  @Get('payments/:id')
  getPayment(
    @Request() req: { user: PatientPrincipal },
    @Param('id') id: string,
  ) {
    return this.portalBillingService.getPayment(req.user, id);
  }

  @Post('invoices/:id/payment')
  initiatePayment(
    @Request() req: { user: PatientPrincipal },
    @Param('id') id: string,
  ) {
    return this.portalBillingService.initiateInvoicePayment(req.user, id);
  }
}
