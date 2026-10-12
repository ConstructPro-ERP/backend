import { ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { HttpExceptionFilter as InvoiceFilter } from '../../apps/invoice-service/src/filters/http-exception.filter';
import { HttpExceptionFilter as PaymentFilter } from '../../apps/payment-service/src/filters/http-exception.filter';

describe.each([InvoiceFilter, PaymentFilter])('%s HTTP errors', (Filter) => {
  let filter: InvoiceFilter | PaymentFilter;
  let host: ArgumentsHost;
  let logError: jest.SpyInstance;
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    filter = new Filter();
    host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [
      'Request rejected',
      { code: 'INTERNAL_ERROR', message: 'Request rejected' },
    ],
    [
      { code: 'DOMAIN_ERROR', message: 'Cannot record payment' },
      { code: 'DOMAIN_ERROR', message: 'Cannot record payment' },
    ],
    [
      { message: ['amount must be positive'] },
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed.',
        details: ['amount must be positive'],
      },
    ],
    [
      { code: 5, message: 7 },
      { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    ],
    [
      null,
      { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    ],
  ])('formats HTTP exception response %j', (body, expected) => {
    filter.catch(new HttpException(body as string, 422), host);
    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining(expected),
    );
  });

  it.each([new Error('private database details'), 'unexpected failure', null])(
    'masks unexpected error details: %s',
    (error) => {
      filter.catch(error, host);
      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        }),
      );
      expect(JSON.stringify(response.json.mock.calls[0])).not.toContain(
        'private database details',
      );
      expect(logError).toHaveBeenCalledTimes(error instanceof Error ? 1 : 0);
    },
  );

  it('includes numeric outstanding balance only in payment errors', () => {
    filter.catch(
      new HttpException(
        {
          code: 'PAYMENT_EXCEEDS_OUTSTANDING',
          message: 'Too much',
          outstandingAmount: 123.45,
        },
        422,
      ),
      host,
    );
    const [body] = response.json.mock.calls[0] as [Record<string, unknown>];
    if (Filter === PaymentFilter) expect(body.outstandingAmount).toBe(123.45);
    else expect(body).not.toHaveProperty('outstandingAmount');
  });
});
