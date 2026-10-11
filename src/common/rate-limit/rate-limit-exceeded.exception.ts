import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitExceededException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}
