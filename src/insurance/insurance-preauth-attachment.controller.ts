import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';
import { getClinicalStorageMaxFileSizeBytes } from '../clinical/attachments/clinical-attachment.config';
import { contentDispositionAttachmentFilename } from '../clinical/attachments/utils/clinical-attachment-filename.util';
import type { ClinicalUploadedFile } from '../clinical/attachments/types/clinical-uploaded-file.type';
import { Body } from '@nestjs/common';
import { UploadPreauthAttachmentDto } from './dto/preauth-attachment.dto';
import { InsurancePreauthAttachmentService } from './insurance-preauth-attachment.service';

@Controller('insurance/pre-authorizations/:preauthId/attachments')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.INSURANCE)
export class InsurancePreauthAttachmentController {
  constructor(
    private readonly attachmentService: InsurancePreauthAttachmentService,
  ) {}

  @Get()
  @RequirePermissions('insurance:read')
  list(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('preauthId') preauthId: string,
  ) {
    return this.attachmentService.list(req.user, preauthId);
  }

  @Post()
  @RequirePermissions('insurance:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: getClinicalStorageMaxFileSizeBytes() },
    }),
  )
  upload(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('preauthId') preauthId: string,
    @UploadedFile() file: ClinicalUploadedFile | undefined,
    @Body() dto: UploadPreauthAttachmentDto,
  ) {
    return this.attachmentService.upload(req.user, preauthId, file, dto);
  }

  @Get(':attachmentId/content')
  @RequirePermissions('insurance:read')
  async download(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('preauthId') preauthId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const content = await this.attachmentService.getContent(
      req.user,
      preauthId,
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
  @RequirePermissions('insurance:manage')
  remove(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('preauthId') preauthId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.attachmentService.softDelete(req.user, preauthId, attachmentId);
  }
}
