import { ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { HttpExceptionFilter } from '../../apps/quotation-service/src/filters/http-exception.filter';

describe('Quotation HttpExceptionFilter', () => {
  let errorSpy: jest.SpyInstance;
  const status = jest.fn();
  const json = jest.fn();
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
  } as unknown as ArgumentsHost;
  const fallback = {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    status.mockReturnValue({ json });
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    {
      response: 'Missing quotation',
      body: { ...fallback, message: 'Missing quotation' },
    },
    {
      response: { code: 'QUOTATION_LOCKED', message: 'Locked' },
      body: { code: 'QUOTATION_LOCKED', message: 'Locked' },
    },
    {
      response: { error: 'Not Found', message: 'Missing' },
      body: { code: 'Not Found', message: 'Missing' },
    },
    {
      response: { code: 'DOMAIN_ERROR', error: 'Fallback' },
      body: { ...fallback, code: 'DOMAIN_ERROR' },
    },
    { response: { code: 42, message: 42 }, body: fallback },
    {
      response: { code: null, error: 'Fallback' },
      body: { ...fallback, code: 'Fallback' },
    },
    { response: {}, body: fallback },
    {
      response: { message: ['Invalid lead', 'Invalid item'] },
      body: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed.',
        details: ['Invalid lead', 'Invalid item'],
      },
    },
    {
      response: { message: [] },
      body: { code: 'VALIDATION_ERROR', message: 'Validation failed.' },
    },
  ])('formats HTTP response $response', ({ response, body }) => {
    new HttpExceptionFilter().catch(new HttpException(response, 422), host);
    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(body);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs unexpected errors while hiding their message and stack from clients', () => {
    const error = new Error('private database credentials');
    new HttpExceptionFilter().catch(error, host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(fallback);
    expect(errorSpy).toHaveBeenCalledWith(error.message, error.stack);
  });

  it.each([null, undefined, 'private failure', { secret: 'credentials' }])(
    'safely formats a thrown non-Error value: %s',
    (exception) => {
      new HttpExceptionFilter().catch(exception, host);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(fallback);
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );
});
