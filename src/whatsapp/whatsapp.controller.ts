import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsAppMessageQueryDto } from './dto/whatsapp-message-query.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Post(':id/whatsapp/messages')
  @RequirePermissions('whatsapp:send')
  sendMessage(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: SendWhatsAppMessageDto,
  ) {
    return this.whatsAppService.sendMessage(req.user, id, dto);
  }

  @Get(':id/whatsapp/messages')
  @RequirePermissions('whatsapp:read')
  listMessages(
    @Request() req: any,
    @Param('id') id: string,
    @Query() query: WhatsAppMessageQueryDto,
  ) {
    return this.whatsAppService.listMessages(req.user, id, query);
  }

  @Get(':id/whatsapp/conversation')
  @RequirePermissions('whatsapp:read')
  getConversation(@Request() req: any, @Param('id') id: string) {
    return this.whatsAppService.getConversation(req.user, id);
  }
}
