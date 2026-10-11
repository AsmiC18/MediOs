import { RazorpayReadError } from './razorpay.errors';



/** Razorpay SDK maximum `count` per collection request (see RazorpayPaginationOptions). */

export const RAZORPAY_LIST_PAGE_SIZE = 100;



/** Safety cap so pagination cannot loop unbounded. */

export const RAZORPAY_LIST_MAX_ITEMS = 2000;



export type RazorpayCollectionPage<T> = {

  items?: T[];

};



/**

 * Fetches all pages of a Razorpay collection using `skip` + `count` pagination.

 * Stops when a page returns fewer items than requested or the list is empty.

 */

export async function collectRazorpayCollectionPages<T>(

  fetchPage: (skip: number, count: number) => Promise<RazorpayCollectionPage<T>>,

): Promise<T[]> {

  const collected: T[] = [];

  let skip = 0;



  while (collected.length < RAZORPAY_LIST_MAX_ITEMS) {

    const pageSize = Math.min(

      RAZORPAY_LIST_PAGE_SIZE,

      RAZORPAY_LIST_MAX_ITEMS - collected.length,

    );

    const response = await fetchPage(skip, pageSize);

    const items = response.items ?? [];



    collected.push(...items);



    if (items.length === 0 || items.length < pageSize) {

      return collected;

    }



    skip += items.length;



    if (
      items.length === pageSize &&
      collected.length >= RAZORPAY_LIST_MAX_ITEMS
    ) {
      throw new RazorpayReadError(
        'permanent',
        `Razorpay collection exceeded safety limit of ${RAZORPAY_LIST_MAX_ITEMS} items`,
      );
    }

  }



  return collected;

}


