import { RazorpayReadError } from './razorpay.errors';

import { RazorpayService } from './razorpay.service';



const mockPaymentLinkFetch = jest.fn();

const mockPaymentsFetch = jest.fn();

const mockFetchRefund = jest.fn();

const mockPaymentLinkAll = jest.fn();

const mockRefundsAll = jest.fn();



jest.mock('razorpay', () => {

  return jest.fn().mockImplementation(() => ({

    paymentLink: {

      fetch: (...args: unknown[]) => mockPaymentLinkFetch(...args),

      all: (...args: unknown[]) => mockPaymentLinkAll(...args),

    },

    payments: {

      fetch: (...args: unknown[]) => mockPaymentsFetch(...args),

      fetchRefund: (...args: unknown[]) => mockFetchRefund(...args),

    },

    refunds: {

      all: (...args: unknown[]) => mockRefundsAll(...args),

    },

  }));

});



function sdkHttpError(statusCode: number) {
  return { statusCode, error: { description: 'sdk error' } };
}



describe('RazorpayService read-only error taxonomy', () => {

  let service: RazorpayService;



  beforeEach(() => {

    process.env.RAZORPAY_MOCK_MODE = 'false';

    process.env.RAZORPAY_KEY_ID = 'key_test';

    process.env.RAZORPAY_KEY_SECRET = 'secret_test';

    mockPaymentLinkFetch.mockReset();

    mockPaymentsFetch.mockReset();

    mockFetchRefund.mockReset();

    mockPaymentLinkAll.mockReset();

    mockRefundsAll.mockReset();

    service = new RazorpayService();

  });



  const readCases: Array<{

    status: number;

    expected: RazorpayReadError['kind'];

    method: () => Promise<unknown>;

    setup: () => void;

  }> = [

    {

      status: 404,

      expected: 'not_found',

      setup: () => mockPaymentLinkFetch.mockRejectedValue(sdkHttpError(404)),

      method: () => service.fetchPaymentLink('plink_missing'),

    },

    {

      status: 401,

      expected: 'permanent',

      setup: () => mockPaymentsFetch.mockRejectedValue(sdkHttpError(401)),

      method: () => service.fetchPayment('pay_401'),

    },

    {

      status: 403,

      expected: 'permanent',

      setup: () => mockFetchRefund.mockRejectedValue(sdkHttpError(403)),

      method: () => service.fetchRefund('pay_1', 'rfnd_1'),

    },

    {

      status: 400,

      expected: 'permanent',

      setup: () => mockPaymentLinkFetch.mockRejectedValue(sdkHttpError(400)),

      method: () => service.fetchPaymentLink('plink_bad'),

    },

    {

      status: 429,

      expected: 'retryable',

      setup: () => mockPaymentLinkFetch.mockRejectedValue(sdkHttpError(429)),

      method: () => service.fetchPaymentLink('plink_rate'),

    },

    {

      status: 500,

      expected: 'retryable',

      setup: () => mockPaymentsFetch.mockRejectedValue(sdkHttpError(500)),

      method: () => service.fetchPayment('pay_500'),

    },

    {

      status: 502,

      expected: 'retryable',

      setup: () => mockFetchRefund.mockRejectedValue(sdkHttpError(502)),

      method: () => service.fetchRefund('pay_1', 'rfnd_502'),

    },

    {

      status: 503,

      expected: 'retryable',

      setup: () => mockPaymentLinkFetch.mockRejectedValue(sdkHttpError(503)),

      method: () => service.fetchPaymentLink('plink_503'),

    },

  ];



  it.each(readCases)(

    'HTTP $status → $expected on read methods',

    async ({ status, expected, method, setup }) => {

      setup();

      await expect(method()).rejects.toMatchObject({

        name: 'RazorpayReadError',

        kind: expected,

        httpStatus: status,

      } satisfies Partial<RazorpayReadError>);
    },

  );



  it('classifies read timeout as retryable', async () => {

    const timeout = new Error('timed out');

    timeout.name = 'TimeoutError';

    mockPaymentLinkFetch.mockRejectedValue(timeout);

    await expect(service.fetchPaymentLink('plink_timeout')).rejects.toMatchObject({

      kind: 'retryable',

    });

  });



  it('classifies read network errors as retryable', async () => {

    mockPaymentsFetch.mockRejectedValue(new Error('ECONNRESET'));

    await expect(service.fetchPayment('pay_net')).rejects.toMatchObject({

      kind: 'retryable',

    });

  });

});


