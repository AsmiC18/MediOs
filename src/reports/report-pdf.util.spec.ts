import { renderReportPdf } from './report-pdf.util';

describe('renderReportPdf', () => {
  it('produces a PDF buffer with report header', async () => {
    const buffer = await renderReportPdf({
      title: 'Test Financial Summary',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      branchId: null,
      generatedAt: '2026-01-15T00:00:00.000Z',
      tables: [
        {
          title: 'Totals',
          headers: ['Metric', 'Value'],
          rows: [['Net collected', '100.00']],
        },
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(200);
  });
});
