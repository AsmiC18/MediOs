import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { getClinicalStorageMaxFileSizeBytes } from './clinical-attachment.config';
import { ClinicalAttachmentService } from './clinical-attachment.service';
import { UploadClinicalAttachmentDto } from './dto/upload-clinical-attachment.dto';
import type { ClinicalUploadedFile } from './types/clinical-uploaded-file.type';

@Controller('clinical/encounters')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.CLINICAL)
export class ClinicalEncounterAttachmentController {
  constructor(
    private readonly clinicalAttachmentService: ClinicalAttachmentService,
  ) {}

  @Post(':encounterId/attachments')
  @RequirePermissions('clinical:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: getClinicalStorageMaxFileSizeBytes() },
    }),
  )
  uploadAttachment(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('encounterId') encounterId: string,
    @UploadedFile() file: ClinicalUploadedFile | undefined,
    @Body() dto: UploadClinicalAttachmentDto,
  ) {
    return this.clinicalAttachmentService.uploadForEncounter(
      req.user,
      encounterId,
      file,
      dto,
    );
  }

  @Get(':encounterId/attachments')
  @RequirePermissions('clinical:read')
  listAttachments(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('encounterId') encounterId: string,
  ) {
    return this.clinicalAttachmentService.listForEncounter(req.user, encounterId);
  }
}
