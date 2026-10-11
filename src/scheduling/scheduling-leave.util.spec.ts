import { ConflictException } from '@nestjs/common';
import {
  assertNoLeaveOverlapFound,
  leaveAppliesToAppointmentBranch,
  schedulingIntervalsOverlap,
} from './scheduling-leave.util';

describe('scheduling-leave.util', () => {
  describe('schedulingIntervalsOverlap', () => {
    it('detects overlap when intervals share interior time', () => {
      const aStart = new Date('2028-01-01T09:00:00.000Z');
      const aEnd = new Date('2028-01-01T10:00:00.000Z');
      const bStart = new Date('2028-01-01T09:30:00.000Z');
      const bEnd = new Date('2028-01-01T10:30:00.000Z');
      expect(schedulingIntervalsOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
    });

    it('allows touching intervals (end equals start)', () => {
      const aStart = new Date('2028-01-01T09:00:00.000Z');
      const aEnd = new Date('2028-01-01T10:00:00.000Z');
      const bStart = new Date('2028-01-01T10:00:00.000Z');
      const bEnd = new Date('2028-01-01T11:00:00.000Z');
      expect(schedulingIntervalsOverlap(aStart, aEnd, bStart, bEnd)).toBe(false);
    });
  });

  describe('leaveAppliesToAppointmentBranch', () => {
    it('hospital-wide leave applies to any appointment branch', () => {
      expect(leaveAppliesToAppointmentBranch(null, 'branch-a')).toBe(true);
    });

    it('branch leave applies only when appointment branch matches', () => {
      expect(leaveAppliesToAppointmentBranch('branch-a', 'branch-a')).toBe(true);
      expect(leaveAppliesToAppointmentBranch('branch-a', 'branch-b')).toBe(false);
    });

    it('branch leave does not apply when appointment has no branch', () => {
      expect(leaveAppliesToAppointmentBranch('branch-a', null)).toBe(false);
    });
  });

  describe('assertNoLeaveOverlapFound', () => {
    it('throws ConflictException when overlap exists', () => {
      expect(() => assertNoLeaveOverlapFound({ id: 'lv-1' })).toThrow(
        ConflictException,
      );
    });

    it('does nothing when no overlap', () => {
      expect(() => assertNoLeaveOverlapFound(null)).not.toThrow();
    });
  });
});
