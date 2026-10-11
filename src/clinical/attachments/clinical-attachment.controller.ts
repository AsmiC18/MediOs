import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import {
  Controller,
  Delete,
  Get,
  Param,
  Request,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { ClinicalAttachmentService } from './clinical-attachment.service';
import { contentDispositionAttachmentFilename } from './utils/clinical-attachment-filename.util';

@Controller('clinical/attachments')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.CLINICAL)
export class ClinicalAttachmentController {
  constructor(
    private readonly clinicalAttachmentService: ClinicalAttachmentService,
  ) {}

  @Get(':attachmentId/content')
  @RequirePermissions('clinical:read')
  async downloadContent(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('attachmentId') attachmentId: string,
  ) {
    const content = await this.clinicalAttachmentService.getAttachmentContent(
      req.user,
      attachmentId,
    );

    const size = Number(content.sizeBytes);
    return new StreamableFile(content.stream, {
      type: content.contentType,
      disposition: contentDispositionAttachmentFilename(content.originalFileName),
      ...(Number.isSafeInteger(size) && size > 0 ? { length: size } : {}),
    });
  }

  @Delete(':attachmentId')
  @RequirePermissions('clinical:manage')
  deleteAttachment(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.clinicalAttachmentService.softDeleteAttachment(
      req.user,
      attachmentId,
    );
  }
}
