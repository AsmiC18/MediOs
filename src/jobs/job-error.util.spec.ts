import {
  serializeJobErrorForLog,
  truncateJobError,
} from './job-error.util';

describe('job-error.util', () => {
  describe('truncateJobError', () => {
    it('returns the message for a normal Error', () => {
      const error = new Error('connection refused');
      expect(truncateJobError(error)).toBe('connection refused');
    });

    it('falls back when Error message is empty', () => {
      const error = new Error('');
      error.name = 'DatabaseError';
      expect(truncateJobError(error)).toBe('DatabaseError');
    });

    it('joins nested messages for AggregateError with empty parent message', () => {
      const error = new AggregateError([
        new Error('first failure'),
        new Error('second failure'),
      ]);
      expect(truncateJobError(error)).toBe('first failure; second failure');
    });
  });

  describe('serializeJobErrorForLog', () => {
    it('captures type, message, and stack for a normal Error', () => {
      const error = new Error('leader lock query failed');
      const details = serializeJobErrorForLog(error);

      expect(details.errorType).toBe('Error');
      expect(details.message).toBe('leader lock query failed');
      expect(details.stack).toContain('leader lock query failed');
      expect(details.nestedErrors).toBeUndefined();
    });

    it('falls back for empty-message Error and includes code when present', () => {
      const error = Object.assign(new Error(''), {
        name: 'DatabaseError',
        code: '42883',
      });
      const details = serializeJobErrorForLog(error);

      expect(details.errorType).toBe('Error');
      expect(details.message).toBe('DatabaseError: 42883');
      expect(details.code).toBe('42883');
    });

    it('includes nested errors for AggregateError', () => {
      const inner = Object.assign(new Error('hashtext missing'), {
        name: 'DatabaseError',
        code: '42883',
      });
      const error = new AggregateError([inner, new Error('connect timeout')]);
      const details = serializeJobErrorForLog(error);

      expect(details.errorType).toBe('AggregateError');
      expect(details.message).toBe('hashtext missing; connect timeout');
      expect(details.nestedErrors).toEqual([
        {
          errorType: 'Error',
          message: 'hashtext missing',
          code: '42883',
        },
        {
          errorType: 'Error',
          message: 'connect timeout',
        },
      ]);
    });

    it('redacts database URLs from messages and stack', () => {
      const error = new Error(
        'connect failed postgresql://user:secret@localhost:5432/medios',
      );
      error.stack = `Error: connect failed postgresql://user:secret@localhost:5432/medios\n    at Object.<anonymous>`;
      const details = serializeJobErrorForLog(error);

      expect(details.message).not.toContain('secret');
      expect(details.message).toContain('[REDACTED_DATABASE_URL]');
      expect(details.stack).toContain('[REDACTED_DATABASE_URL]');
    });
  });
});
