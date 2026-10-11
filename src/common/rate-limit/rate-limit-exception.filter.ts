import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitExceededException } from './rate-limit-exceeded.exception';

@Catch(RateLimitExceededException)
export class RateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: RateLimitExceededException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    const body = exception.getResponse();
    response.status(exception.getStatus()).json(body);
  }
}
