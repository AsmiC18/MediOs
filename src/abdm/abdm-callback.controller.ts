import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AbdmCallbackService } from './abdm-callback.service';
import { AbdmEnvironmentService } from './abdm-environment.service';

@Controller('api/v3/hip/token')
export class AbdmCallbackController {
  constructor(
    private readonly callbackService: AbdmCallbackService,
    private readonly environmentService: AbdmEnvironmentService,
  ) {}

  @Post('on-generate-token')
  @HttpCode(HttpStatus.OK)
  async onGenerateToken(
    @Body() body: unknown,
    @Headers('x-abdm-callback-secret') callbackSecret?: string,
  ) {
    const expectedSecret = this.environmentService.getCallbackSecret();

    if (expectedSecret && callbackSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid ABDM callback secret');
    }

    return this.callbackService.handleGenerateTokenCallback(body);
  }
}
