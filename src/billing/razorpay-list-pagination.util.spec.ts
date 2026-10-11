import {
  collectRazorpayCollectionPages,
  RAZORPAY_LIST_MAX_ITEMS,
  RAZORPAY_LIST_PAGE_SIZE,
} from './razorpay-list-pagination.util';
import { RazorpayReadError } from './razorpay.errors';

describe('collectRazorpayCollectionPages', () => {
  it('aggregates multiple pages until a short page is returned', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ items: Array.from({ length: RAZORPAY_LIST_PAGE_SIZE }, (_, i) => i) })
      .mockResolvedValueOnce({ items: [100, 101] });

    const items = await collectRazorpayCollectionPages(fetchPage);

    expect(items).toHaveLength(RAZORPAY_LIST_PAGE_SIZE + 2);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[0]).toEqual([0, RAZORPAY_LIST_PAGE_SIZE]);
    expect(fetchPage.mock.calls[1][0]).toBe(RAZORPAY_LIST_PAGE_SIZE);
  });

  it('throws when the safety item cap is reached with a full page', async () => {
    const fullPage = Array.from({ length: RAZORPAY_LIST_PAGE_SIZE }, (_, i) => i);
    const fetchPage = jest.fn().mockResolvedValue({ items: fullPage });

    await expect(
      collectRazorpayCollectionPages(fetchPage),
    ).rejects.toBeInstanceOf(RazorpayReadError);

    const pagesNeeded = Math.ceil(
      RAZORPAY_LIST_MAX_ITEMS / RAZORPAY_LIST_PAGE_SIZE,
    );
    expect(fetchPage).toHaveBeenCalledTimes(pagesNeeded);
  });
});
