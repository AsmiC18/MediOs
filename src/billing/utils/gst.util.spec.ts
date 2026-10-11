import { GstSupplyType } from '@prisma/client';
import {
  assertGstItemsHaveValidHsnSac,
  computeGstInvoice,
  TaxedLineHsnSacError,
} from './gst.util';

describe('GST HSN/SAC validation', () => {
  it('rejects taxed lines without HSN/SAC', () => {
    expect(() =>
      assertGstItemsHaveValidHsnSac([
        { description: 'Consult', gstRate: 18, hsnSac: undefined },
      ]),
    ).toThrow(TaxedLineHsnSacError);
  });

  it('allows zero-GST lines without HSN/SAC', () => {
    expect(() =>
      assertGstItemsHaveValidHsnSac([
        { description: 'Exempt', gstRate: 0, hsnSac: undefined },
      ]),
    ).not.toThrow();
  });

  it('computeGstInvoice preserves CGST/SGST split for intra-state taxed lines', () => {
    const result = computeGstInvoice(
      [
        {
          description: 'Service',
          quantity: 1,
          unitPrice: 1000,
          gstRate: 18,
          hsnSac: '998311',
        },
      ],
      'hospital-1',
      GstSupplyType.INTRA_STATE,
    );

    expect(result.cgstAmount.toNumber()).toBe(90);
    expect(result.sgstAmount.toNumber()).toBe(90);
    expect(result.igstAmount.toNumber()).toBe(0);
    expect(result.computedItems[0].hsnSac).toBe('998311');
  });

  it('computeGstInvoice rejects taxed line missing HSN', () => {
    expect(() =>
      computeGstInvoice(
        [
          {
            description: 'Bad',
            quantity: 1,
            unitPrice: 100,
            gstRate: 5,
          },
        ],
        'hospital-1',
        GstSupplyType.INTRA_STATE,
      ),
    ).toThrow(TaxedLineHsnSacError);
  });
});
