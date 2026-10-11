import { Injectable } from '@nestjs/common';
import { JobHandler } from './job-handler.types';

/**
 * Maps job.type to handler implementations.
 * Phase B: no production business handlers; register handlers in tests or future phases.
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  get(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }
}
