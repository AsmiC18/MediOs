import { deidentifyReportPayload } from './report-deidentification.util';

describe('deidentifyReportPayload', () => {
  it('removes common PII fields from nested report payloads', () => {
    const cleaned = deidentifyReportPayload({
      totals: { count: 3 },
      nested: {
        phone: '+919999999999',
        email: 'a@b.com',
        abhaNumber: '123',
        linkToken: 'secret',
      },
    }) as Record<string, unknown>;

    expect(JSON.stringify(cleaned)).not.toMatch(/phone|email|linkToken|abhaNumber/i);
    expect((cleaned.nested as Record<string, unknown>).phone).toBeUndefined();
  });
});
