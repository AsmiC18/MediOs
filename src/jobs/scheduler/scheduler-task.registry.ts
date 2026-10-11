import { Injectable } from '@nestjs/common';
import { SchedulerTask } from './scheduler.types';

@Injectable()
export class SchedulerTaskRegistry {
  private readonly tasks: SchedulerTask[] = [];

  register(task: SchedulerTask): void {
    this.tasks.push(task);
  }

  list(): SchedulerTask[] {
    return [...this.tasks];
  }
}
