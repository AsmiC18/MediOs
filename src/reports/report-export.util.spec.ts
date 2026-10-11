import {
  escapeCsvCell,
  neutralizeCsvFormulaInjection,
  serializeFinancialSummaryToCsv,
  serializeGstReportToCsv,
  serializePharmacyShrinkToCsv,
} from './report-export.util';

describe('report-export.util', () => {
  it('neutralizes CSV formula injection', () => {
    expect(neutralizeCsvFormulaInjection('=SUM(A1)')).toBe("'=SUM(A1)");
  });

  it('escapes commas and quotes in CSV cells', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('serializes financial summary as a single bounded row', () => {
    const csv = serializeFinancialSummaryToCsv({
      invoiceCount: 2,
      invoiceTotal: '1500.00',
      successfulPaymentCount: 1,
      successfulPaymentTotal: '1000.00',
      refundCount: 1,
      refundTotal: '100.00',
      netCollected: '900.00',
    });

    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('900.00');
  });

  it('serializes GST summary and HSN breakdown', () => {
    const csv = serializeGstReportToCsv(
      {
        invoiceCount: 1,
        taxableValue: '1000.00',
        cgst: '90.00',
        sgst: '90.00',
        igst: '0.00',
        totalTax: '180.00',
      },
      [
        {
          hsnSac: '998311',
          taxableValue: '1000.00',
          cgst: '90.00',
          sgst: '90.00',
          igst: '0.00',
          totalTax: '180.00',
        },
      ],
    );

    expect(csv).toContain('998311');
    expect(csv).toContain('hsnSac');
  });

  it('serializes pharmacy shrink rows', () => {
    const csv = serializePharmacyShrinkToCsv(
      [
        { movementType: 'ADJUSTMENT_OUT', quantity: 2 },
        { movementType: 'EXPIRED', quantity: 1 },
      ],
      3,
    );
    expect(csv).toContain('ADJUSTMENT_OUT');
    expect(csv).toContain('TOTAL,3');
  });
});
